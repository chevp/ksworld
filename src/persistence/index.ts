import path from 'node:path';
import { readFile } from '../util/traced-fs.js';
import type { Action } from '../model/action.js';
import type { Agent } from '../model/agent.js';
import type { Capability } from '../model/capability.js';
import type { Content } from '../model/content.js';
import type { Data } from '../model/data.js';
import type { Lab } from '../model/lab.js';
import type { Launcher } from '../model/launcher.js';
import type { Layout } from '../model/layout.js';
import type { Recipe } from '../model/recipe.js';
import type { AgentRef, LabRef, Ref, TechniqueRef } from '../model/refs.js';
import { formatRef, makeRef, parseRef } from '../model/refs.js';
import type { Request } from '../model/request.js';
import type { Technique } from '../model/technique.js';
import type { TechniqueRun } from '../model/techniqueRun.js';
import type { Workflow, WorkflowCategory, WorkflowJob } from '../model/workflow.js';
import { WORKFLOW_CATEGORIES } from '../model/workflow.js';
import { WorldGraph } from '../graph/world-graph.js';
import { parseActionDocument } from './parsers/action.js';
import { parseAgentDocument } from './parsers/agent.js';
import { parseCapTechTechnique } from './parsers/capTechTechnique.js';
import { parseNexoDocument } from './parsers/nexo.js';
import { parseOperationRegistry, parseTomlFile } from './parsers/toml.js';
import { parseYamlFile } from './parsers/yaml.js';
import { listDir, walk } from './walk.js';

export interface UnresolvedReference {
  from: Ref;
  kind: 'capability' | 'delegate';
  detail: string;
}

export interface WorldProjection {
  root: string;
  labs: Map<string, Lab>;
  techniques: Map<string, Technique>;
  workflows: Map<string, Workflow>;
  recipes: Map<string, Recipe>;
  agents: Map<string, Agent>;
  actions: Map<string, Action>;
  requests: Map<string, Request>;
  data: Map<string, Data>;
  launchers: Map<string, Launcher>;
  content: Map<string, Content>;
  layouts: Map<string, Layout>;
  techniqueRuns: Map<string, TechniqueRun>;
  /** The WHAT layer next to `techniques`' HOW (model/capability.ts) — derived, see buildProjection's final pass. */
  capabilities: Map<string, Capability>;
  graph: WorldGraph;
  /** Discovered but unresolved references — validate/validate.ts surfaces these. */
  unresolved: UnresolvedReference[];
}

function toPosixId(root: string, target: string): string {
  return path.relative(root, target).split(path.sep).join('/');
}

async function readReadmeSummary(readmePath: string): Promise<string | undefined> {
  try {
    const text = await readFile(readmePath, 'utf-8');
    const lines = text.split(/\r?\n/).map((line) => line.trim());
    const firstHeading = lines.findIndex((line) => line.startsWith('#'));
    for (let i = firstHeading + 1; i < lines.length; i++) {
      if (lines[i].length > 0) return lines[i];
    }
    return undefined;
  } catch {
    return undefined;
  }
}

async function findLabs(root: string): Promise<Lab[]> {
  const labs: Lab[] = [];

  async function scan(dir: string): Promise<void> {
    const entries = await listDir(dir);
    const names = new Set(entries.map((e) => e.name));

    const hasMainJson = names.has('main.json');
    const hasRegistry = entries.some((e) => e.name === 'operations') || false;
    let operationsRegistryFile: string | undefined;
    if (names.has('operations')) {
      const opsEntries = await listDir(path.join(dir, 'operations'));
      const opsNames = new Set(opsEntries.map((e) => e.name));
      operationsRegistryFile = OPERATIONS_REGISTRY_FILENAMES.find((f) => opsNames.has(f));
    }
    const hasOperationsRegistry = operationsRegistryFile !== undefined;
    const hasReadme = names.has('README.md');
    // 'registry': cap-tech-pipe-lab-shaped Labs (registry/capabilities/*.json +
    // registry/techniques/*.json, no main.json/operations/registry.json of
    // their own) -- see technique.ts's 'package' TechniqueSource doc.
    const hasLabMarkerDir = ['orders', 'agents', 'pipelines', 'declarations', 'source', 'components', 'registry'].some((d) => names.has(d));
    const hasKosmosDir = names.has('.kosmos');

    let detectedBy: Lab['detectedBy'] | undefined;
    if (hasMainJson) detectedBy = 'main.json';
    else if (hasOperationsRegistry) detectedBy = 'operations-registry';
    else if (hasReadme && hasLabMarkerDir) detectedBy = 'README.md';
    else if (hasKosmosDir) detectedBy = 'kosmos-dir';

    if (detectedBy) {
      const id = toPosixId(root, dir);
      const readmeSummary = hasReadme ? await readReadmeSummary(path.join(dir, 'README.md')) : undefined;
      labs.push({
        ref: makeRef('lab', id),
        dir,
        name: id,
        detectedBy,
        hasMainJson,
        hasOperationsRegistry,
        operationsRegistryFile,
        readmeSummary,
        luaScripts: [],
        requires: [],
        provenance: 'authored',
        lifecycle: 'canonical',
      });
      return; // no nested Labs
    }

    for (const entry of entries) {
      if (entry.isDirectory) await scan(entry.path);
    }
    void hasRegistry;
  }

  await scan(root);
  return labs;
}

const STEP_RUN_PATTERN = /--step\s+([A-Za-z0-9_-]+)/;

/** worldctl only ever writes/looks for JSON here — eon.exe's own registryIn()
    (ContentBuildCmd.cpp:56-62) still reads `.yaml`/`.yml`/`.toml` too, but
    those are no longer produced in labs/**. */
const OPERATIONS_REGISTRY_FILENAMES = ['registry.json'];

function detectWorkflowCategory(fileName: string): WorkflowCategory | undefined {
  for (const category of WORKFLOW_CATEGORIES) {
    if (fileName.endsWith(`.${category}.eon`)) return category;
  }
  return undefined;
}

interface PendingDelegate {
  fromAgent: AgentRef;
  targetPath: string;
}

interface PendingLabRequire {
  lab: Lab;
  /** Raw `main.json` `requires[]` entries — fully-qualified refs, e.g. `technique.content-labs/engine/mannequin-lab.rig`. */
  rawRefs: string[];
}

interface PendingLauncher {
  launcher: Launcher;
  targetPath: string;
}

export async function buildProjection(root: string): Promise<WorldProjection> {
  const projection: WorldProjection = {
    root,
    labs: new Map(),
    techniques: new Map(),
    workflows: new Map(),
    recipes: new Map(),
    agents: new Map(),
    actions: new Map(),
    requests: new Map(),
    data: new Map(),
    launchers: new Map(),
    content: new Map(),
    layouts: new Map(),
    techniqueRuns: new Map(),
    capabilities: new Map(),
    graph: new WorldGraph(),
    unresolved: [],
  };

  const pathToRef = new Map<string, Ref>();
  const techniquesByLabAndName = new Map<string, Map<string, TechniqueRef>>();
  const pendingDelegates: PendingDelegate[] = [];
  const pendingLaunchers: PendingLauncher[] = [];
  const pendingLabRequires: PendingLabRequire[] = [];

  const labs = await findLabs(root);
  for (const lab of labs) {
    projection.labs.set(lab.ref.id, lab);
    projection.graph.addObject(lab.ref, lab);
  }

  // Technique: operations/registry.json + main.json's provides.techniques[] --
  // both come from a Lab's OWN file, so (unlike the global Content Discovery
  // pass below) they stay bound to their Lab, unchanged by the 2026-09-10
  // decoupling (docs/plans/worldctl-content-discovery-decoupling-2026-09-10.md).
  for (const lab of labs) {
    const labIdKey = lab.ref.id;
    if (!techniquesByLabAndName.has(labIdKey)) techniquesByLabAndName.set(labIdKey, new Map());
    const nameMap = techniquesByLabAndName.get(labIdKey)!;

    // Technique: operations/registry.json
    if (lab.hasOperationsRegistry && lab.operationsRegistryFile) {
      const registryPath = path.join(lab.dir, 'operations', lab.operationsRegistryFile);
      try {
        const registry = await parseOperationRegistry(registryPath);
        for (const op of registry.operation ?? []) {
          const ref = makeRef('technique', `${labIdKey}.${op.name}`);
          const technique: Technique = {
            ref,
            labRef: lab.ref,
            source: 'registry',
            name: op.name,
            summary: op.summary,
            runtime: op.runtime,
            args: op.args,
            path: registryPath,
            provenance: 'authored',
            lifecycle: 'canonical',
          };
          projection.techniques.set(formatRef(ref), technique);
          projection.graph.addObject(ref, technique);
          nameMap.set(op.name, ref);
          // registry.json's own `name` and its `args`' `--step <name>` routinely differ
          // (e.g. name="validate", args="--step verify") — index both.
          const argsStepMatch = op.args ? STEP_RUN_PATTERN.exec(op.args) : null;
          if (argsStepMatch) nameMap.set(argsStepMatch[1], ref);
        }
      } catch (err) {
        console.error(`ksworld: failed to parse ${registryPath}: ${(err as Error).message}`);
      }
    }

    // Technique: main.json's provides.techniques[] (content.build/1 Lab
    // manifest) -- a Lab's OWN claim about what it already provides. Read as
    // evidence pointing at a real file, exactly like a registry.json
    // operation; nobody re-verifies the file actually implements the claim.
    // This is the third, previously-missing source
    // (docs/capability-catalog.json's "EXISTING_UNREGISTERED": a real
    // `*.mechanic.lua` that registry.json never pointed at). `main.json`'s
    // `workspace`/`unit` keys (the real
    // content.build/1 recipe eon.exe reads) are left untouched — `provides`
    // is a new, optional, additive key next to them; eon.exe's own reader
    // (frostlib/BuildModel.cpp) only ever looks up the keys it names, so an
    // extra top-level key is silently ignored there, never rejected.
    if (lab.hasMainJson) {
      const mainJsonPath = path.join(lab.dir, 'main.json');
      try {
        const doc = JSON.parse(await readFile(mainJsonPath, 'utf-8')) as Record<string, unknown>;

        // Identity: main.json's own `lab.name`/`lab.description`, additive next
        // to `workspace` (present only for the aggregation form) -- a Lab's
        // identity should exist independent of whether its main.json happens to
        // aggregate `[[unit]]`. Same "extra key, silently ignored by eon.exe"
        // guarantee as `provides` above.
        const labMeta = (typeof doc.lab === 'object' && doc.lab !== null ? doc.lab : undefined) as
          | Record<string, unknown>
          | undefined;
        if (typeof labMeta?.name === 'string') lab.name = labMeta.name;
        if (typeof labMeta?.description === 'string') lab.description = labMeta.description;

        // Dependency: main.json's own `requires[]` -- fully-qualified Technique
        // refs (`technique.<labId>.<name>`), because unlike `provides.techniques`
        // (resolved by bare name, same Lab) this routinely points across a Lab
        // boundary, where bare names collide. Deferred to the second pass below:
        // the target Technique may belong to a Lab not yet visited in this loop.
        const rawRequires = Array.isArray(doc.requires) ? doc.requires.filter((r): r is string => typeof r === 'string') : [];
        if (rawRequires.length > 0) pendingLabRequires.push({ lab, rawRefs: rawRequires });

        const provides = (typeof doc.provides === 'object' && doc.provides !== null ? doc.provides : undefined) as
          | Record<string, unknown>
          | undefined;
        const rawTechniques = Array.isArray(provides?.techniques) ? (provides!.techniques as unknown[]) : [];
        for (const rawTechnique of rawTechniques) {
          if (typeof rawTechnique !== 'object' || rawTechnique === null) continue;
          const t = rawTechnique as Record<string, unknown>;
          const name = typeof t.name === 'string' ? t.name : undefined;
          if (!name) continue;
          const ref = makeRef('technique', `${labIdKey}.${name}`);
          const implementationRel = typeof t.implementation === 'string' ? t.implementation : undefined;
          const technique: Technique = {
            ref,
            labRef: lab.ref,
            source: 'main',
            name,
            summary: typeof t.summary === 'string' ? t.summary : undefined,
            implementation: implementationRel ? path.join(lab.dir, implementationRel) : undefined,
            path: mainJsonPath,
            provenance: 'authored',
            lifecycle: 'canonical',
          };
          projection.techniques.set(formatRef(ref), technique);
          projection.graph.addObject(ref, technique);
          nameMap.set(name, ref);
        }
      } catch (err) {
        console.error(`ksworld: failed to parse ${mainJsonPath}: ${(err as Error).message}`);
      }
    }
  }

  // Ancestor index for labRef assignment below: a File's Lab is the longest
  // matching directory prefix among all discovered Labs, not "the Lab whose
  // walk() found it" (there no longer is one — see the single global walk()
  // right below). Sorted by path length descending so the longest (most
  // specific) prefix is tried first; no match -> labRef stays undefined
  // (User decision: Lab is source/organisation context, not the World's
  // factual boundary; see docs/plans/worldctl-content-discovery-decoupling-
  // 2026-09-10.md).
  const labsByDirDesc = [...labs].sort((a, b) => b.dir.length - a.dir.length);
  function findAncestorLab(filePath: string): Lab | undefined {
    for (const lab of labsByDirDesc) {
      if (filePath === lab.dir || filePath.startsWith(lab.dir + path.sep)) return lab;
    }
    return undefined;
  }
  /** `<lab-id>` when a File's Lab is known, else the File's own root-relative directory --
      keeps every `${labIdKey}.<name>` Ref-id construction below unique and stable whether
      or not the File sits inside a recognized Lab boundary. */
  function idKeyFor(lab: Lab | undefined, filePath: string): string {
    return lab ? lab.ref.id : toPosixId(root, path.dirname(filePath));
  }

  // Single global walk, classification by filename only -- a File is relevant because it
  // represents a known World Content type, not because it sits under a recognized Lab
  // directory (2026-09-10 decoupling). Same SKIP_DIRS semantics as before (persistence/walk.ts).
  const eonFiles: string[] = [];
  const agentFiles: string[] = [];
  const actionFiles: string[] = [];
  const dataFiles: string[] = [];
  const wishFiles: string[] = [];
  const nexoFiles: string[] = [];
  const catalogFiles: string[] = [];
  const capTechTechniqueFiles: string[] = [];
  const layoutFiles: string[] = [];
  const pipe25dRunFiles: string[] = [];

  /** True when `segments` occur consecutively anywhere among `filePath`'s path components --
      the global-walk replacement for the old per-Lab `startsWith(<lab.dir>/<segments>/)` check. */
  function underSegments(filePath: string, segments: string[]): boolean {
    const parts = filePath.split(path.sep);
    for (let i = 0; i + segments.length <= parts.length; i++) {
      if (segments.every((segment, j) => parts[i + j] === segment)) return true;
    }
    return false;
  }

  for await (const entry of walk(root)) {
    if (entry.isDirectory) continue;
    if (entry.name.endsWith('.glayout.json')) layoutFiles.push(entry.path);
    else if (entry.name.endsWith('.agent')) agentFiles.push(entry.path);
    else if (entry.name.endsWith('.action')) actionFiles.push(entry.path);
    else if (entry.name.endsWith('.eon')) eonFiles.push(entry.path);
    else if (entry.name.endsWith('.nexo')) nexoFiles.push(entry.path);
    else if (entry.name.endsWith('.wish.md') || (entry.name === 'wish.md' && path.basename(path.dirname(entry.path)) === 'orders')) wishFiles.push(entry.path);
    // `catalog/assets/*.json` specifically (not every catalog/**/*.json — east-lab's own
    // catalog/ also holds catalog.manifest.json, catalog-writer-output.schema.json etc.
    // beside the real per-object entries; those are Infrastructure, not Content, and
    // already indexed as `data`/schema through the ordinary branches below).
    else if (entry.name.endsWith('.json') && underSegments(entry.path, ['catalog', 'assets'])) catalogFiles.push(entry.path);
    // `registry/techniques/*.json` specifically (cap-tech-pipe-lab shape -- no `kind`
    // field, matched by directory; `registry/capabilities/*.json`, the WHAT layer, is
    // intentionally not indexed yet, see technique.ts).
    else if (entry.name.endsWith('.json') && underSegments(entry.path, ['registry', 'techniques'])) capTechTechniqueFiles.push(entry.path);
    // `assets/pipe25d/**` specifically -- a pipe25d Technique Run's own `meta.json`/
    // `*.meta.json` (schema checked below, `schema.ts`'s `assetRootFor()` convention).
    else if ((entry.name === 'meta.json' || entry.name.endsWith('.meta.json')) && underSegments(entry.path, ['assets', 'pipe25d'])) pipe25dRunFiles.push(entry.path);
    else if (entry.name.endsWith('.registry.json') || entry.name.endsWith('.schema.json')) dataFiles.push(entry.path);
    else if (entry.name.endsWith('.lua')) {
      const scriptsLab = findAncestorLab(entry.path);
      if (scriptsLab && entry.path.startsWith(path.join(scriptsLab.dir, 'scripts') + path.sep)) {
        scriptsLab.luaScripts.push(entry.path);
      }
    }
  }

  // TechniqueRun: assets/pipe25d/**/meta.json | *.meta.json -- evidence that a pipe25d
  // Technique actually ran (schema: 'pipe-gen2.5d-lab/run-meta@1'). Same detection/field
  // shape as packages/pipe25d-core/src/runsList.ts's listTechniqueRuns() -- this is
  // worldctl's own indexed copy of the same evidence, not a re-derivation of it.
  for (const filePath of pipe25dRunFiles) {
    let doc: { schema?: string; technique?: string; createdAt?: string; ok?: boolean; summary?: string; artifacts?: { label: string; path: string; kind: string }[] };
    try {
      doc = JSON.parse(await readFile(filePath, 'utf-8'));
    } catch (err) {
      console.error(`ksworld: failed to parse ${filePath}: ${(err as Error).message}`);
      continue;
    }
    if (doc.schema !== 'pipe-gen2.5d-lab/run-meta@1' || !doc.technique) continue;

    const lab = findAncestorLab(filePath);
    const labIdKey = idKeyFor(lab, filePath);
    const nameMap = lab ? techniquesByLabAndName.get(lab.ref.id) : undefined;
    const base = path.basename(filePath);
    const runId = base === 'meta.json' ? path.basename(path.dirname(filePath)) : base.slice(0, -'.meta.json'.length);
    const ref = makeRef('techniqueRun', `${labIdKey}.${doc.technique}.${runId}`);
    const techniqueRef = nameMap?.get(doc.technique);
    const illustrative = path.join('reference', 'game-content-template', 'assets', 'pipe25d')
      .split(path.sep)
      .every((segment) => filePath.includes(segment));

    const techniqueRun: TechniqueRun = {
      ref,
      labRef: lab?.ref,
      techniqueRef,
      techniqueId: doc.technique,
      runId,
      ok: !!doc.ok,
      createdAt: doc.createdAt ?? '',
      summary: doc.summary ?? '',
      metaPath: filePath,
      artifacts: doc.artifacts ?? [],
      illustrative,
      provenance: 'technique_run',
      lifecycle: 'derived',
      path: filePath,
    };
    projection.techniqueRuns.set(formatRef(ref), techniqueRun);
    projection.graph.addObject(ref, techniqueRun);
    if (techniqueRef) {
      projection.graph.addEdge({ from: ref, relation: illustrative ? 'illustrates' : 'producedBy', to: techniqueRef });
    }
  }

  // Technique: registry/techniques/*.json (cap-tech-pipe-lab shape, no
  // `kind` field — matched by directory above) -- evidence pointing at
  // that Lab's own packages/service-graph-executor, same "evidence, not
  // proof" contract as main.json's provides.techniques[] above. See
  // technique.ts's TechniqueSource doc and kosmos-quickstarts/
  // cap-tech-pipe-lab/schema/technique.schema.json for the real shape
  // this indexes (that Lab's own Ajv validate.ts is the actual gate).
  for (const filePath of capTechTechniqueFiles) {
    let doc;
    try {
      doc = await parseCapTechTechnique(filePath);
    } catch (err) {
      console.error(`ksworld: failed to parse ${filePath}: ${(err as Error).message}`);
      continue;
    }
    if (!doc.id) continue;
    const lab = findAncestorLab(filePath);
    const labIdKey = idKeyFor(lab, filePath);
    const nameMap = lab ? techniquesByLabAndName.get(lab.ref.id) : undefined;
    const ref = makeRef('technique', `${labIdKey}.${doc.id}`);
    const technique: Technique = {
      ref,
      labRef: lab?.ref,
      source: 'package',
      name: doc.id,
      summary: doc.summary ?? doc.title,
      capabilityId: doc.capability,
      consumesArtifacts: doc.consumesArtifacts,
      producesArtifacts: doc.producesArtifacts,
      profileAffinity: doc.profileAffinity,
      origin: doc.origin,
      path: filePath,
      provenance: 'imported',
      lifecycle: 'canonical',
    };
    projection.techniques.set(formatRef(ref), technique);
    projection.graph.addObject(ref, technique);
    nameMap?.set(doc.id, ref);
  }

  // Content: catalog/assets/*.json — a cross-Lab convention (env-asset-lab
  // `env-asset-lab.catalog-entry/1`, east-lab `east-lab.prop-catalog-
  // entry/1`, documented-compatible with each other, no shared schema
  // file) that predates this Ref kind; matched by SHAPE (`id` + `source`
  // or `identity`), not by an exhaustive `kind` allowlist, so a Lab this
  // session never looked at is not silently skipped for spelling its own
  // `kind` string differently.
  for (const filePath of catalogFiles) {
    let doc: unknown;
    try {
      doc = JSON.parse(await readFile(filePath, 'utf-8'));
    } catch (err) {
      console.error(`ksworld: failed to parse ${filePath}: ${(err as Error).message}`);
      continue;
    }
    if (typeof doc !== 'object' || doc === null) continue;
    const record = doc as Record<string, unknown>;
    const id = typeof record.id === 'string' ? record.id : undefined;
    const source = typeof record.source === 'object' && record.source !== null ? (record.source as Record<string, unknown>) : undefined;
    const identity = typeof record.identity === 'object' && record.identity !== null ? (record.identity as Record<string, unknown>) : undefined;
    if (!id || (!source && !identity)) continue; // not shaped like a catalog entry — leave it to `data`

    const lab = findAncestorLab(filePath);
    const labIdKey = idKeyFor(lab, filePath);
    const ref = makeRef('content', `${labIdKey}.${id}`);
    // Not always relative: catalogize_recipe.py's own `source.builtFrost`
    // (env-asset-lab) writes an already-resolved, drive-letter-absolute
    // path (`Z:\...`), while `source.recipe` stays lab-relative — a real,
    // pre-existing inconsistency between the two fields in that tool, not
    // something to paper over by assuming one convention for both. No Lab
    // ancestor -> resolve against the catalog entry's own directory instead.
    const resolveMaybeRelative = (value: string) => (path.isAbsolute(value) ? value : path.join(lab ? lab.dir : path.dirname(filePath), value));
    const recipeRel = source && typeof source.recipe === 'string' ? source.recipe : undefined;
    const builtFrostRel = source && typeof source.builtFrost === 'string' ? source.builtFrost : undefined;
    const content: Content = {
      ref,
      labRef: lab?.ref,
      category: typeof record.category === 'string' ? record.category : undefined,
      status: typeof record.status === 'string' ? record.status : undefined,
      role: identity && typeof identity.role === 'string' ? identity.role : undefined,
      path: filePath,
      recipePath: recipeRel ? resolveMaybeRelative(recipeRel) : undefined,
      builtFrostPath: builtFrostRel ? resolveMaybeRelative(builtFrostRel) : undefined,
      provenance: 'authored',
      lifecycle: 'canonical',
    };
    projection.content.set(formatRef(ref), content);
    projection.graph.addObject(ref, content);
  }

  // Layout: *.glayout.json (docs/plans/glayout-json-format.md) -- read-only,
  // worldctl only indexes the file for search/inspect, it never interprets
  // `graph.nodes`/`graph.edges` beyond a count.
  for (const filePath of layoutFiles) {
    let doc: unknown;
    try {
      doc = JSON.parse(await readFile(filePath, 'utf-8'));
    } catch (err) {
      console.error(`ksworld: failed to parse ${filePath}: ${(err as Error).message}`);
      continue;
    }
    if (typeof doc !== 'object' || doc === null) continue;
    const record = doc as Record<string, unknown>;
    const graph = typeof record.graph === 'object' && record.graph !== null ? (record.graph as Record<string, unknown>) : undefined;
    if (!graph || typeof graph.id !== 'string') continue; // not shaped like a .glayout.json -- leave it to `data`
    const id = graph.id;

    const lab = findAncestorLab(filePath);
    const labIdKey = idKeyFor(lab, filePath);
    const ref = makeRef('layout', `${labIdKey}.${id}`);
    const layout: Layout = {
      ref,
      labRef: lab?.ref,
      name: typeof graph.name === 'string' ? graph.name : undefined,
      nodeCount: Array.isArray(graph.nodes) ? graph.nodes.length : 0,
      edgeCount: Array.isArray(graph.edges) ? graph.edges.length : 0,
      path: filePath,
      provenance: 'authored',
      lifecycle: 'canonical',
    };
    projection.layouts.set(formatRef(ref), layout);
    projection.graph.addObject(ref, layout);
  }

  // Workflow / Recipe: *.eon files
  for (const filePath of eonFiles) {
    let doc: unknown;
    try {
      doc = await parseYamlFile(filePath);
    } catch (yamlErr) {
      // Some .eon files in the real tree are TOML, not YAML (`kind = 'kosflow/2'` vs. `kind: 'kosflow/2'`).
      try {
        doc = await parseTomlFile(filePath);
      } catch {
        console.error(`ksworld: failed to parse ${filePath}: ${(yamlErr as Error).message}`);
        continue;
      }
    }
    if (typeof doc !== 'object' || doc === null) continue;
    const record = doc as Record<string, unknown>;
    const kind = typeof record.kind === 'string' ? record.kind : undefined;
    if (kind !== 'kosflow/2' && kind !== 'kosaction/1') continue;

    const lab = findAncestorLab(filePath);
    const fileName = path.basename(filePath);
    const isRecipe = fileName.endsWith('.recipe.eon');
    // No Lab ancestor -> relId already IS the full root-relative id (no separate lab prefix
    // to combine it with below), same as idKeyFor's fallback for the other Ref kinds.
    const relId = toPosixId(lab ? lab.dir : root, filePath).replace(/\.eon$/, '');
    const labIdKey = lab ? lab.ref.id : undefined;
    const name = typeof record.name === 'string' ? record.name : relId;
    const description = typeof record.description === 'string' ? record.description : undefined;

    const jobs: WorkflowJob[] = [];
    const rawJobs = Array.isArray(record.jobs) ? record.jobs : [];
    for (const rawJob of rawJobs) {
      if (typeof rawJob !== 'object' || rawJob === null) continue;
      const jobRecord = rawJob as Record<string, unknown>;
      const rawSteps = Array.isArray(jobRecord.steps) ? jobRecord.steps : [];
      const steps = rawSteps.map((rawStep) => {
        const stepRecord = (typeof rawStep === 'object' && rawStep !== null ? rawStep : {}) as Record<string, unknown>;
        const withRecord = (typeof stepRecord.with === 'object' && stepRecord.with !== null ? stepRecord.with : {}) as Record<string, unknown>;
        return {
          name: typeof stepRecord.name === 'string' ? stepRecord.name : undefined,
          uses: typeof stepRecord.uses === 'string' ? stepRecord.uses : undefined,
          run: typeof withRecord.run === 'string' ? withRecord.run : undefined,
        };
      });
      jobs.push({
        id: typeof jobRecord.id === 'string' ? jobRecord.id : 'job',
        name: typeof jobRecord.name === 'string' ? jobRecord.name : undefined,
        needs: Array.isArray(jobRecord.needs) ? jobRecord.needs.filter((n): n is string => typeof n === 'string') : [],
        steps,
      });
    }

    // Best effort, not a full interpreter (doc mapping note): most `--step X` values
    // are a lab-specific script's own private dispatch vocabulary, never registered
    // as a registry.json operation at all — a miss here is expected, not a defect,
    // so only a HIT becomes a `requires` edge; a miss is silently not one.
    const nameMap = lab ? techniquesByLabAndName.get(lab.ref.id) : undefined;
    const requires: TechniqueRef[] = [];
    for (const job of jobs) {
      for (const step of job.steps) {
        if (!step.run) continue;
        const match = STEP_RUN_PATTERN.exec(step.run);
        if (!match) continue;
        const techniqueRef = nameMap?.get(match[1]);
        if (techniqueRef) requires.push(techniqueRef);
      }
    }

    if (isRecipe) {
      const ref = makeRef('recipe', labIdKey ? `${labIdKey}.${relId}` : relId);
      const recipe: Recipe = {
        ref,
        labRef: lab?.ref,
        name,
        description,
        steps: jobs.map((job) => job.id),
        requires,
        path: filePath,
        provenance: 'authored',
        lifecycle: 'canonical',
      };
      projection.recipes.set(formatRef(ref), recipe);
      projection.graph.addObject(ref, recipe);
      pathToRef.set(filePath, ref);
    } else {
      const ref = makeRef('workflow', labIdKey ? `${labIdKey}.${relId}` : relId);
      const workflow: Workflow = {
        ref,
        labRef: lab?.ref,
        source: 'eon',
        name,
        description,
        category: detectWorkflowCategory(fileName),
        jobs,
        requires,
        path: filePath,
        provenance: 'authored',
        lifecycle: 'canonical',
      };
      projection.workflows.set(formatRef(ref), workflow);
      projection.graph.addObject(ref, workflow);
      for (const techniqueRef of requires) {
        projection.graph.addEdge({ from: ref, relation: 'requires', to: techniqueRef });
      }
      pathToRef.set(filePath, ref);
    }
  }

  // Agent: *.agent (nexo-agent source)
  for (const filePath of agentFiles) {
    let doc;
    try {
      doc = await parseAgentDocument(filePath);
    } catch (err) {
      console.error(`ksworld: failed to parse ${filePath}: ${(err as Error).message}`);
      continue;
    }
    if (!doc.kind || !doc.kind.startsWith('agent')) continue;
    const lab = findAncestorLab(filePath);
    const labIdKey = idKeyFor(lab, filePath);
    const baseName = path.basename(filePath, '.agent');
    const ref = makeRef('agent', `${labIdKey}.${baseName}`);
    const agent: Agent = {
      ref,
      labRef: lab?.ref,
      source: 'nexo-agent',
      name: doc.name ?? baseName,
      description: doc.description,
      delegatesTo: [],
      declaredCapabilities: doc.capabilities ?? [],
      path: filePath,
      provenance: 'authored',
      lifecycle: 'canonical',
    };
    projection.agents.set(formatRef(ref), agent);
    projection.graph.addObject(ref, agent);
    pathToRef.set(filePath, ref);

    for (const delegate of doc.delegates ?? []) {
      const targetPath = path.resolve(path.dirname(filePath), delegate.agent);
      pendingDelegates.push({ fromAgent: ref, targetPath });
    }
  }

  // Launcher: *.nexo — a pointer at a Workflow/Recipe or Agent (model/launcher.ts).
  for (const filePath of nexoFiles) {
    let doc;
    try {
      doc = await parseNexoDocument(filePath);
    } catch (err) {
      console.error(`ksworld: failed to parse ${filePath}: ${(err as Error).message}`);
      continue;
    }
    if (doc.kind !== 'nexo/1' && doc.kind !== 'nexo/2' && doc.kind !== 'nexo/4' && doc.kind !== 'nexo/5') continue;
    const lab = findAncestorLab(filePath);
    const labIdKey = idKeyFor(lab, filePath);
    const baseName = path.basename(filePath, '.nexo');
    const ref = makeRef('launcher', `${labIdKey}.${baseName}`);

    // nexo/2, nexo/4 and nexo/5 are all agent-networks (real labs, e.g.
    // east-lab's components/**, now outnumber nexo/1's single-pointer
    // files) — none of them targets a Workflow/Recipe directly, only its own
    // `network.nodes[]` Agents. nexo/4 (docs/ideas/nexo-4-orchestrator) adds
    // planning/execution/evaluation/capabilities/etc.; nexo/5
    // (docs/plans/gworld-nexo-schritt1.md) is `gworld compile`'s
    // deterministic single-entry output — both indexed here purely as plain
    // JSON, same as nexo/2; worldctl does not interpret nexo/4's
    // agentic-orchestration fields. Resolve to the `entry` node (or the sole
    // node when there is exactly one, e.g. a single-agent network with no
    // branching) the same way nexo/1's own `target` resolves; a multi-node
    // network with no `entry` is indexed as a Launcher but left with an
    // unresolved target — best effort, not a full interpreter, same as
    // `--step` resolution above.
    let targetType = 'unknown';
    let targetPath = '';
    if (doc.kind === 'nexo/2' || doc.kind === 'nexo/4' || doc.kind === 'nexo/5') {
      const nodes = doc.network?.nodes ?? [];
      const entryNode = (doc.entry ? nodes.find((n) => n.id === doc.entry) : undefined) ?? (nodes.length === 1 ? nodes[0] : undefined);
      if (entryNode?.agent) {
        targetType = 'agent';
        targetPath = entryNode.agent;
      }
    } else {
      targetType = doc.target?.type ?? 'unknown';
      targetPath = doc.target?.path ?? '';
    }

    const launcher: Launcher = {
      ref,
      labRef: lab?.ref,
      name: doc.name ?? baseName,
      description: doc.description,
      targetType,
      targetPath,
      path: filePath,
      provenance: 'authored',
      lifecycle: 'canonical',
    };
    projection.launchers.set(formatRef(ref), launcher);
    projection.graph.addObject(ref, launcher);
    if (targetPath) {
      const resolvedTargetPath = path.resolve(path.dirname(filePath), targetPath);
      pendingLaunchers.push({ launcher, targetPath: resolvedTargetPath });
    }
  }

  // Action: *.action (execution/1, formerly .afrost — reads JSON or YAML)
  for (const filePath of actionFiles) {
    let parsed;
    try {
      parsed = await parseActionDocument(filePath);
    } catch (err) {
      console.error(`ksworld: failed to parse ${filePath}: ${(err as Error).message}`);
      continue;
    }
    if (parsed.doc.kind !== 'execution/1') continue;
    const lab = findAncestorLab(filePath);
    const labIdKey = idKeyFor(lab, filePath);
    const baseName = path.basename(filePath, '.action');
    const ref = makeRef('action', `${labIdKey}.${baseName}`);
    const action: Action = {
      ref,
      labRef: lab?.ref,
      name: parsed.doc.name ?? baseName,
      uses: parsed.doc.uses,
      run: parsed.doc.with?.run,
      outputs: parsed.doc.outputs ?? {},
      format: parsed.format,
      path: filePath,
      provenance: 'authored',
      lifecycle: 'canonical',
    };
    projection.actions.set(formatRef(ref), action);
    projection.graph.addObject(ref, action);
  }

  // Data: *.registry.json / *.schema.json
  for (const filePath of dataFiles) {
    const lab = findAncestorLab(filePath);
    const labIdKey = idKeyFor(lab, filePath);
    const baseName = path.basename(filePath).replace(/\.(registry|schema)\.json$/, '');
    const source = filePath.endsWith('.schema.json') ? 'schema' : 'registry';
    const ref = makeRef('data', `${labIdKey}.${baseName}`);
    const data: Data = { ref, labRef: lab?.ref, source, name: baseName, path: filePath, provenance: 'authored', lifecycle: 'canonical' };
    projection.data.set(formatRef(ref), data);
    projection.graph.addObject(ref, data);
  }

  // Request: orders/wish.md, *.wish.md
  for (const filePath of wishFiles) {
    let text = '';
    try {
      text = await readFile(filePath, 'utf-8');
    } catch (err) {
      console.error(`ksworld: failed to read ${filePath}: ${(err as Error).message}`);
      continue;
    }
    const lab = findAncestorLab(filePath);
    const labIdKey = idKeyFor(lab, filePath);
    const baseName = path.basename(filePath, '.md').replace(/\.wish$/, '');
    const ref = makeRef('request', `${labIdKey}.${baseName}`);
    const request: Request = { ref, labRef: lab?.ref, text, path: filePath, provenance: 'authored', lifecycle: 'canonical' };
    projection.requests.set(formatRef(ref), request);
    projection.graph.addObject(ref, request);
  }

  // Second pass: resolve path-based edges.
  for (const pending of pendingDelegates) {
    const targetRef = pathToRef.get(pending.targetPath);
    if (!targetRef || targetRef.kind !== 'agent') {
      projection.unresolved.push({ from: pending.fromAgent, kind: 'delegate', detail: pending.targetPath });
      continue;
    }
    const agent = projection.agents.get(formatRef(pending.fromAgent));
    if (!agent) continue;
    agent.delegatesTo.push(targetRef as AgentRef);
    projection.graph.addEdge({ from: pending.fromAgent, relation: 'delegatesTo', to: targetRef });
  }

  // Best effort, not an error: a Launcher's target.path routinely points outside
  // this projection's Lab set, or at a file kind worldctl doesn't index at all.
  for (const pending of pendingLaunchers) {
    const targetRef = pathToRef.get(pending.targetPath);
    if (!targetRef) continue;
    pending.launcher.target = targetRef;
    projection.graph.addEdge({ from: pending.launcher.ref, relation: 'launches', to: targetRef });
  }

  // Capability: one per distinct id claimed by a "package"-sourced Technique's
  // `capabilityId` field (model/capability.ts). N:M by construction:
  // `implementedBy` collects every Technique claiming the id, in any Lab.
  const capabilityImplementers = new Map<string, TechniqueRef[]>();
  for (const technique of projection.techniques.values()) {
    const capabilityId = technique.source === 'package' ? technique.capabilityId : undefined;
    if (!capabilityId) continue;
    const list = capabilityImplementers.get(capabilityId) ?? [];
    list.push(technique.ref);
    capabilityImplementers.set(capabilityId, list);
  }
  for (const [id, implementedBy] of capabilityImplementers) {
    const ref = makeRef('capability', id);
    const capability: Capability = { ref, id, implementedBy };
    projection.capabilities.set(formatRef(ref), capability);
    projection.graph.addObject(ref, capability);
    for (const techRef of implementedBy) {
      projection.graph.addEdge({ from: ref, relation: 'implementedBy', to: techRef });
    }
  }

  // main.json's `requires[]` -- fully-qualified Technique refs, resolved
  // against every Technique now indexed (any source: registry, main.json
  // `provides.techniques`, package). A malformed ref (wrong kind,
  // unparseable) is reported the same as a real miss: the author wrote
  // something that does not resolve, and the distinction is not worth a
  // second unresolved kind.
  for (const pending of pendingLabRequires) {
    for (const rawRef of pending.rawRefs) {
      let target: TechniqueRef | undefined;
      try {
        const parsed = parseRef(rawRef);
        if (parsed.kind === 'technique') target = projection.techniques.get(formatRef(parsed))?.ref;
      } catch {
        target = undefined;
      }
      if (target) {
        pending.lab.requires.push(target);
        projection.graph.addEdge({ from: pending.lab.ref, relation: 'requires', to: target });
      } else {
        projection.unresolved.push({ from: pending.lab.ref, kind: 'capability', detail: rawRef });
      }
    }
  }

  return projection;
}
