import { formatRef, makeRef } from '../model/refs.js';
import type { MutationOperation } from '../mutate/operations.js';
import type { WorldProjection } from '../persistence/index.js';
import type { WorldRepository } from '../persistence/repository.js';
import { planToJson, type PlanJson } from '../cli/format.js';
import { findContent } from '../read/content.js';
import { diagnoseCapability } from './diagnose.js';
import { resolveCapabilityCandidates } from './capability.js';
import { planOrder } from './plan.js';

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
  plans: PlanJson[];
  unmatched: UnmatchedRequirement[];
  assets: GplanAsset[];
}

/**
 * The one `.gflow`-domain-specific input this whole module needs: `game.id` +
 * the already-compiled `requirements[]` + `assets.generation[]` — nothing
 * else of the `.gflow`'s flat namespace vocabulary. Kept as a narrow slice
 * (not `gflow.schema.json`'s full shape) so `resolveGflow` stays a generic
 * requirements-in/plan-out step, not a second place that understands the
 * `.gflow` schema.
 */
export interface GflowSlice {
  gflowPath: string;
  gameId: string;
  requirements: GflowRequirement[];
  assetsGeneration: GflowAssetGeneration[];
}

/**
 * Everything `gworldui/src/services/RunService.cpp`'s `dispatchMatch()` +
 * `dispatchBuild()`'s propose/apply/plan portion used to do over N `worldctl`
 * subprocess calls stitched together in C++ — now ONE in-process pass. See
 * docs/ideas/execution-plan/gflow-specification.md and
 * `content-gamedna-lab/.kosmos/workflows/gflow.schema.json`'s `jobs`
 * description (removed alongside this — resolution is no longer a `.gflow`-
 * declared job, it is this command).
 *
 * `apply` (writing a new Order into `labs/**`) happens here automatically,
 * without a confirmation gate — same as `RunService.cpp` did silently before
 * this change. Only `worldctl build` (real generation, real cost) is ever
 * gated behind a confirmation, and that stays a `gworldui` UI concern reading
 * the `.gplan.json` this function produces.
 */
export async function resolveGflow(repo: WorldRepository, input: GflowSlice): Promise<GplanDocument> {
  const projection = await repo.load();

  const matchedByLab = new Map<string, string[]>();
  const unmatched: UnmatchedRequirement[] = [];
  let assetGenerationLabId: string | undefined;

  for (const req of input.requirements) {
    // Capability Ref -> implementedBy/providedBy -> candidates, N:M, lowest ref
    // wins deterministically (resolve/capability.ts). Skip a candidate with no
    // Lab context (2026-09-10 decoupling: a Technique can match with labRef
    // undefined) rather than failing outright -- another candidate may have one.
    const chosen = resolveCapabilityCandidates(projection, req.capability).find((c) => c.technique.labRef);

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

    const labId = chosen.technique.labRef!.id;
    const list = matchedByLab.get(labId) ?? [];
    list.push(req.capability);
    matchedByLab.set(labId, list);
    if (req.capability === 'asset_generation') assetGenerationLabId = labId;
  }

  const orderedLabs: string[] = [];
  for (const [labId, capabilities] of matchedByLab) {
    const operation: MutationOperation = { kind: 'createOrder', labId, id: input.gameId, requires: capabilities };
    try {
      await repo.applyMutation(operation);
      orderedLabs.push(labId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('refusing to overwrite existing')) {
        // createDrakarRequest() (mutate/writers/agent-writer.ts) refuses this
        // wording when declarations/requests/<id>.drakar.json already exists
        // — not a failure, the order from an earlier resolve is reused as-is.
        orderedLabs.push(labId);
        continue;
      }
      unmatched.push({ id: '', capability: capabilities.join(','), reason: `order.${labId}.${input.gameId}: ${message}` });
    }
  }

  // Re-derive at most once, after every order in this run was created --
  // `planOrder` needs the freshly created Orders in the projection; the
  // asset lookups below don't depend on them, but reuse this same
  // projection rather than reload again.
  const finalProjection = orderedLabs.length > 0 ? await repo.load() : projection;

  const plans: PlanJson[] = [];
  for (const labId of orderedLabs) {
    const orderRef = makeRef('order', `${labId}.${input.gameId}`);
    try {
      const plan = await planOrder(finalProjection, orderRef);
      plans.push(planToJson(plan));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      unmatched.push({ id: '', capability: (matchedByLab.get(labId) ?? []).join(','), reason: `plan(order.${labId}.${input.gameId}): ${message}` });
    }
  }

  const resolvedAssets = input.assetsGeneration.map((entry) => resolveAsset(finalProjection, entry, assetGenerationLabId));

  return {
    gflow: input.gflowPath,
    gameId: input.gameId,
    resolvedAt: new Date().toISOString(),
    plans,
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
