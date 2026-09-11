import { formatRef, makeRef } from '../model/refs.js';
import type { WorldProjection } from '../persistence/index.js';
import type { WorldRepository } from '../persistence/repository.js';
import { findContent } from '../read/content.js';
import { diagnoseCapability, exactMatches } from './diagnose.js';

/** One `.gflow`'s already-compiled `requirements[]` entry (gflow.schema.json) — only the fields resolution needs. */
export interface GflowRequirement {
  id: string;
  capability: string;
  sourceKey?: string;
  quantity?: number;
  features?: string[];
  dependencies?: string[];
  outputs?: string[];
}

/** One `.gflow`'s `assets.generation[]` entry (gflow.schema.json) — only the fields resolution needs. */
export interface GflowAssetGeneration {
  id: string;
  kind: string;
  appliesTo?: string;
  prompt: string;
  style?: string;
  mode?: 'reuse' | 'placeholder' | 'generate' | 'upgrade';
}

export interface UnmatchedRequirement {
  id: string;
  capability: string;
  reason: string;
}

export interface MatchedRequirement {
  id: string;
  capability: string;
  technique: string;
  lab: string;
}

export interface GplanAsset {
  sourceId: string;
  kind: string;
  status: 'resolved' | 'pending' | 'unresolved';
  resolvedRef?: string;
  candidateRef?: string;
  reason?: string;
  prompt?: string;
  style?: string;
}

export interface GplanDocument {
  gflow: string;
  gameId: string;
  resolvedAt: string;
  matched: MatchedRequirement[];
  unmatched: UnmatchedRequirement[];
  assets: GplanAsset[];
}

/**
 * The one `.gflow`-domain-specific input this whole module needs: `game.id` +
 * the already-compiled `requirements[]` + `assets.generation[]` — nothing
 * else of the `.gflow`'s flat namespace vocabulary. Kept as a narrow slice
 * (not `gflow.schema.json`'s full shape) so `resolveGflow` stays a generic
 * requirements-in/report-out step, not a second place that understands the
 * `.gflow` schema.
 */
export interface GflowSlice {
  gflowPath: string;
  gameId: string;
  requirements: GflowRequirement[];
  assetsGeneration: GflowAssetGeneration[];
}

/**
 * Requirement -> Technique match report + asset resolution. Read-only: this
 * function writes nothing (no Order, no Agent dispatch — ksworld executes
 * no native process, see README.md). For each requirement it reports which
 * Technique would satisfy it (`exactMatches`, same rule `diagnose.ts` uses),
 * or, when nothing matches, `diagnoseCapability`'s reason.
 */
export async function resolveGflow(repo: WorldRepository, input: GflowSlice): Promise<GplanDocument> {
  const projection = await repo.load();

  const matched: MatchedRequirement[] = [];
  const unmatched: UnmatchedRequirement[] = [];
  let assetGenerationLabId: string | undefined;

  for (const req of input.requirements) {
    const hits = exactMatches(projection, req.capability).filter((t) => t.labRef);
    const chosen = hits[0];

    if (!chosen) {
      const diag = diagnoseCapability(projection, req.capability, {
        id: req.id,
        sourceKey: req.sourceKey,
        quantity: req.quantity,
        features: req.features,
        dependencies: req.dependencies,
        outputs: req.outputs,
      });
      unmatched.push({ id: req.id, capability: req.capability, reason: diag.reason });
      continue;
    }

    const labId = chosen.labRef!.id;
    matched.push({ id: req.id, capability: req.capability, technique: formatRef(chosen.ref), lab: labId });
    if (req.capability === 'asset_generation') assetGenerationLabId = labId;
  }

  const resolvedAssets = input.assetsGeneration.map((entry) => resolveAsset(projection, entry, assetGenerationLabId));

  return {
    gflow: input.gflowPath,
    gameId: input.gameId,
    resolvedAt: new Date().toISOString(),
    matched,
    unmatched,
    assets: resolvedAssets,
  };
}

/**
 * Resource-level resolution for ONE `assets.generation[]` entry. Deliberately
 * modest: `reuse` mode (or an unset mode that happens to already exist) is
 * looked up via the same generic `findContent()` every `worldctl content
 * find` call uses; anything else is only ever a `pending` CANDIDATE ref
 * (`content.<lab>.<sourceId>`, reusing the `.gflow`'s own stable asset id
 * rather than inventing a new naming scheme) — whether the matched Lab's own
 * build+catalogize step actually assigns that exact id is that Lab's own
 * convention (confirmed true for env-asset-lab, NOT verified for any other
 * Lab) and is not re-checked here. A later `worldctl content find` after a
 * real build is how a `pending` entry gets confirmed — out of scope for this
 * function, which only ever reads, never builds.
 */
export function resolveAsset(projection: WorldProjection, entry: GflowAssetGeneration, targetLabId: string | undefined): GplanAsset {
  const base = { sourceId: entry.id, kind: entry.kind, prompt: entry.prompt, style: entry.style };

  const hits = findContent(projection, entry.id);
  const exact = hits.find((c) => c.ref.id.endsWith(`.${entry.id}`));
  if (exact) {
    return { ...base, status: 'resolved', resolvedRef: formatRef(exact.ref) };
  }

  if (!targetLabId) {
    return { ...base, status: 'unresolved', reason: 'no matched Lab for the "asset_generation" requirement -- see unmatched[]' };
  }

  return { ...base, status: 'pending', candidateRef: formatRef(makeRef('content', `${targetLabId}.${entry.id}`)) };
}
