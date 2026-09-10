import path from 'node:path';
import type { Content, ContentArtifact } from '../model/content.js';
import { formatRef } from '../model/refs.js';
import type { WorldProjection } from '../persistence/index.js';
import { listDir, walk } from '../persistence/walk.js';
import { readFile } from '../util/traced-fs.js';

/** QUERIES, never writes (doc §5). All Content in the projection, optionally scoped to one Lab. */
export function listContent(projection: WorldProjection, labId?: string): Content[] {
  const all = [...projection.content.values()];
  const scoped = labId ? all.filter((c) => c.labRef?.id === labId) : all;
  return scoped.sort((a, b) => formatRef(a.ref).localeCompare(formatRef(b.ref)));
}

/** Case-insensitive substring match on id/category/role -- same shape as read/search.ts's generic search, specialized for the fields Content actually has. */
export function findContent(projection: WorldProjection, term: string): Content[] {
  const needle = term.toLowerCase();
  return listContent(projection).filter((c) => {
    const haystack = `${c.ref.id} ${c.category ?? ''} ${c.role ?? ''}`.toLowerCase();
    return haystack.includes(needle);
  });
}

/** `content.<labId>.<catalogId>` -> `<catalogId>` -- the id fragment every real file (`build/<catalogId>.*`, `placements[].catalogId`) is actually named after.
    No Lab -> `ref.id` carries no lab prefix to strip (idKeyFor's root-relative-dir fallback), so the last `.`-segment is the catalog id itself. */
function shortId(content: Content): string {
  if (!content.labRef) return content.ref.id.slice(content.ref.id.lastIndexOf('.') + 1);
  return content.ref.id.slice(content.labRef.id.length + 1);
}

/** `build/<id>/manifest.json`'s own real shape (`env-asset-lab.build-manifest/1`, tools/write_manifest.py) -- read here, never written. */
interface BuildManifest {
  artifacts?: Record<string, string>;
  validation?: Record<string, string>;
  catalog?: string;
}

/**
 * Resolves every file this Content object owns, beyond the catalog entry
 * itself: its Recipe, its built `.frost` (both already named by the entry's
 * own `source.*` fields, no extra I/O), plus its build artifacts.
 *
 * Two real conventions coexist in this Lab right now (2026-09-01, both
 * observed live, not assumed): an older flat one, `build/<id>.<suffix>`
 * (this session's own earlier tool calls), and a newer per-object folder
 * with its own index, `build/<id>/manifest.json` (tools/write_manifest.py,
 * built independently the same day -- see that file's own header). This
 * function PREFERS the manifest when present -- it names its files exactly,
 * no globbing, no guessing which suffix means what -- and only falls back to
 * globbing flat `build/<id>.*` siblings when no manifest exists, so an
 * object built the older way is not simply invisible.
 *
 * Lazy and I/O-bearing on purpose: `build/` is a directory `walk()`
 * (persistence/walk.ts's own `SKIP_DIRS`) never descends into at projection-
 * build time -- Runtime/History/Diagnostics, not indexed the way
 * `catalog/assets/*.json` already is. Doing this extra I/O for every
 * Content object on every `worldctl status`/`content list` across every
 * indexed Lab would slow down commands that never asked for it; only
 * `content inspect`/`content artifacts` call this.
 */
export async function resolveArtifacts(projection: WorldProjection, content: Content): Promise<ContentArtifact[]> {
  const artifacts: ContentArtifact[] = [{ role: 'catalog-entry', path: content.path }];
  if (content.recipePath) artifacts.push({ role: 'recipe', path: content.recipePath });
  if (content.builtFrostPath) artifacts.push({ role: 'built-frost', path: content.builtFrostPath });

  const lab = content.labRef ? projection.labs.get(content.labRef.id) : undefined;
  if (!lab) return artifacts;

  const id = shortId(content);
  const manifestPath = path.join(lab.dir, 'build', id, 'manifest.json');
  try {
    const manifest = JSON.parse(await readFile(manifestPath, 'utf-8')) as BuildManifest;
    artifacts.push({ role: 'build-output', path: manifestPath });
    for (const rel of Object.values(manifest.artifacts ?? {})) artifacts.push({ role: 'build-output', path: path.join(lab.dir, rel) });
    for (const rel of Object.values(manifest.validation ?? {})) artifacts.push({ role: 'build-output', path: path.join(lab.dir, rel) });
    return artifacts; // manifest is authoritative for this object -- no need to also glob
  } catch {
    // No manifest for this id -- fall through to the flat-file convention.
  }

  const buildEntries = await listDir(path.join(lab.dir, 'build'));
  for (const entry of buildEntries) {
    if (entry.isDirectory) continue;
    if (entry.name === id || entry.name.startsWith(`${id}.`)) {
      artifacts.push({ role: 'build-output', path: entry.path });
    }
  }
  return artifacts;
}

/**
 * Every `levels/**\/placements.json` in the SAME Lab whose `placements[].
 * catalogId` names this Content's id -- the real, only reference mechanism
 * env-asset-lab's own `compose_demo_level.py`/`generate_large_level.py`
 * read (2026-09-01 finding: no Ref kind for a Level exists yet, so this
 * greps the real file shape directly rather than inventing one to route
 * through -- a natural next Ref kind, not added in this pass). Cross-Lab
 * references are not searched: no Lab in this repo references another
 * Lab's catalog id today (env-asset-lab/README.md's own "Beziehung zu
 * east-lab" section -- copied by hand, never referenced live).
 */
// ── analyze / migrate --plan ────────────────────────────────────────────────
//
// Both READ-ONLY (doc §5: VALIDATE/DIFF/PLAN never write). Scoped to the
// canonical decision recorded in the 2026-09-01 session: catalog/assets/
// *.json (validated identity) and build/<id>/manifest.json (build artifact
// index) are ONE logical Content model in TWO complementary files, not two
// competing formats -- so neither `analyze` nor `migrate --plan` proposes
// moving a single file. The one real duplicate fact found (source.
// builtFrost vs artifacts.frost, already observed drifted) is the only
// thing either command flags as needing a change, and that change is a
// schema field removal, not a file move.

export interface ContentIssue {
  ref: string;
  kind: 'no-manifest' | 'missing-recipe-file' | 'duplicate-frost-path' | 'orphan-build-entry';
  detail: string;
}

export interface ContentAnalysis {
  totalObjects: number;
  withManifest: number;
  withoutManifest: number;
  issues: ContentIssue[];
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await readFile(p, 'utf-8');
    return true;
  } catch {
    return false;
  }
}

/** `worldctl content analyze` -- real counts against real files, no invented numbers. */
export async function analyzeContent(projection: WorldProjection, labId?: string): Promise<ContentAnalysis> {
  const items = listContent(projection, labId);
  const issues: ContentIssue[] = [];
  let withManifest = 0;

  for (const content of items) {
    const lab = content.labRef ? projection.labs.get(content.labRef.id) : undefined;
    if (!lab) continue;
    const id = shortId(content);
    const manifestPath = path.join(lab.dir, 'build', id, 'manifest.json');
    let manifest: BuildManifest | undefined;
    try {
      manifest = JSON.parse(await readFile(manifestPath, 'utf-8')) as BuildManifest;
      withManifest++;
    } catch {
      issues.push({ ref: formatRef(content.ref), kind: 'no-manifest', detail: `no ${manifestPath}` });
    }

    if (content.recipePath && !(await fileExists(content.recipePath))) {
      issues.push({ ref: formatRef(content.ref), kind: 'missing-recipe-file', detail: `source.recipe names ${content.recipePath}, not on disk` });
    }

    if (manifest?.artifacts?.frost && content.builtFrostPath) {
      const manifestFrost = path.normalize(path.join(lab.dir, manifest.artifacts.frost)).toLowerCase();
      const catalogFrost = path.normalize(content.builtFrostPath).toLowerCase();
      if (manifestFrost !== catalogFrost) {
        issues.push({
          ref: formatRef(content.ref),
          kind: 'duplicate-frost-path',
          detail: `catalog-entry.source.builtFrost ("${content.builtFrostPath}") disagrees with manifest.artifacts.frost ("${path.join(lab.dir, manifest.artifacts.frost)}") -- same fact, two independent writers, already drifted`,
        });
      }
    }
  }

  return { totalObjects: items.length, withManifest, withoutManifest: items.length - withManifest, issues };
}

export interface MigrationPlanEntry {
  ref: string;
  current: string[];
  target: string[];
  changes: string[];
  deletes: string[];
  reason: string;
}

/**
 * `worldctl content migrate --plan` -- per the canonical decision above, NO
 * file this session looked at needs to move: `catalog/assets/<id>.json`
 * and `build/<id>/manifest.json` already sit exactly where their own real
 * consumers (`compose_demo_level.py`, a human scanning `build/`) expect
 * them. The only real change is the field-level fix `analyze` found.
 */
export async function planContentMigration(projection: WorldProjection, labId?: string): Promise<MigrationPlanEntry[]> {
  const analysis = await analyzeContent(projection, labId);
  const byRef = new Map<string, ContentIssue[]>();
  for (const issue of analysis.issues) {
    if (issue.kind !== 'duplicate-frost-path') continue;
    const list = byRef.get(issue.ref) ?? [];
    list.push(issue);
    byRef.set(issue.ref, list);
  }

  const plan: MigrationPlanEntry[] = [];
  for (const [ref, issues] of byRef) {
    const content = projection.content.get(ref);
    if (!content) continue;
    plan.push({
      ref,
      current: [content.path, ...(content.builtFrostPath ? [content.builtFrostPath] : [])],
      target: [content.path], // unchanged location -- only a field inside it changes
      changes: [`remove "source.builtFrost" from ${content.path} (schema/catalog-entry.schema.json: drop from required[], drop from source.properties)`],
      deletes: [],
      reason: issues[0].detail,
    });
  }
  return plan;
}

export async function findContentUsages(projection: WorldProjection, content: Content): Promise<string[]> {
  const lab = content.labRef ? projection.labs.get(content.labRef.id) : undefined;
  if (!lab) return [];
  const id = shortId(content);
  const levelsDir = path.join(lab.dir, 'levels');

  const usages: string[] = [];
  for await (const entry of walk(levelsDir)) {
    if (entry.isDirectory || entry.name !== 'placements.json') continue;
    let doc: unknown;
    try {
      doc = JSON.parse(await readFile(entry.path, 'utf-8'));
    } catch {
      continue;
    }
    const placements = (doc as { placements?: unknown }).placements;
    if (!Array.isArray(placements)) continue;
    const hit = placements.some((p) => typeof p === 'object' && p !== null && (p as Record<string, unknown>).catalogId === id);
    if (hit) usages.push(entry.path);
  }
  return usages;
}
