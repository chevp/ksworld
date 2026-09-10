import { randomBytes } from 'node:crypto';
import type { CapabilityDiagnosis } from '../resolve/diagnose.js';
import { diagnoseCapability } from '../resolve/diagnose.js';
import type { GplanAsset, GplanDocument } from '../resolve/resolveGflow.js';
import type { PlanJson } from '../cli/format.js';
import type { WorldRepository } from '../persistence/repository.js';

/**
 * One unmatched requirement, enriched with `diagnose <capability>`'s own
 * classification (resolve/diagnose.ts) instead of just `resolveGflow`'s
 * one-line `reason` string -- reuses the existing deterministic diagnosis,
 * doesn't reinterpret it.
 */
export interface ExperienceFailure {
  requirementId: string;
  capability: string;
  reason: string;
  diagnosisType: CapabilityDiagnosis['type'];
  matches: CapabilityDiagnosis['matches'];
}

/**
 * The first, deliberately narrow slice of `docs/plans/worldctl-feedback-loop.md`'s
 * Experience concept: resolve-time signal only (which requirements matched a
 * Technique, which didn't and why) -- no build/runtime outcome, no repair
 * attempt, no lesson. `worldctl learn record` writes exactly one of these per
 * `.gplan.json`; nothing reads or generalizes from them yet.
 */
export interface Experience {
  id: string;
  recordedAt: string;
  gplanPath: string;
  gflow: string;
  gameId: string;
  resolvedAt: string;
  summary: {
    matchedCount: number;
    unmatchedCount: number;
    assetsResolved: number;
    assetsPending: number;
    assetsUnresolved: number;
  };
  plans: PlanJson[];
  failures: ExperienceFailure[];
  assets: GplanAsset[];
}

function countAssets(assets: GplanAsset[], status: GplanAsset['status']): number {
  return assets.filter((asset) => asset.status === status).length;
}

/**
 * Builds one `Experience` from an already-written `.gplan.json` (`worldctl
 * resolve`'s output) -- re-loads the projection once to (a) look up each
 * matched Order's real `requires[]` length (`.gplan.json`'s own `plans[]`
 * only carries the order ref, not which capabilities it bundled -- see
 * `resolveGflow.ts`'s `PlanJson`) and (b) re-run `diagnoseCapability` per
 * unmatched requirement for its full classification. Never builds, never
 * mutates -- read-only, same as `diagnose`/`resolve` themselves.
 */
export async function buildExperience(repo: WorldRepository, gplanPath: string, gplan: GplanDocument): Promise<Experience> {
  const projection = await repo.load();

  let matchedCount = 0;
  for (const plan of gplan.plans) {
    const order = projection.orders.get(plan.order);
    if (order) matchedCount += order.requires.length;
  }

  const failures: ExperienceFailure[] = gplan.unmatched
    // resolveGflow.ts also pushes synthetic unmatched[] entries with id: ''
    // for an order-create/plan failure (not a requirement) -- those have no
    // requirement to diagnose, skip them here.
    .filter((u) => u.id)
    .map((u) => {
      const diagnosis = diagnoseCapability(projection, u.capability, { id: u.id });
      return {
        requirementId: u.id,
        capability: u.capability,
        reason: u.reason,
        diagnosisType: diagnosis.type,
        matches: diagnosis.matches,
      };
    });

  return {
    id: `${gplan.gameId}-${Date.now().toString(36)}-${randomBytes(2).toString('hex')}`,
    recordedAt: new Date().toISOString(),
    gplanPath,
    gflow: gplan.gflow,
    gameId: gplan.gameId,
    resolvedAt: gplan.resolvedAt,
    summary: {
      matchedCount,
      unmatchedCount: gplan.unmatched.length,
      assetsResolved: countAssets(gplan.assets, 'resolved'),
      assetsPending: countAssets(gplan.assets, 'pending'),
      assetsUnresolved: countAssets(gplan.assets, 'unresolved'),
    },
    plans: gplan.plans,
    failures,
    assets: gplan.assets,
  };
}
