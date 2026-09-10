import { formatRef, makeRef, type AgentRef } from '../model/refs.js';
import type { Technique } from '../model/technique.js';
import type { WorldProjection } from '../persistence/index.js';
import { exactMatches } from './diagnose.js';

export interface CapabilityCandidate {
  technique: Technique;
  agent: AgentRef;
}

/**
 * gflow requirement's capability id -> Capability Ref -> implementedBy/providedBy
 * -> ordered Technique candidates. Reads the already-derived Capability graph
 * (persistence/index.ts, model/capability.ts) instead of re-filtering
 * `projection.techniques` itself -- `implementedBy`/`providedBy` IS the N:M
 * index Phase 2 built for exactly this. Falls back to the old
 * `exactMatches()` string match (resolve/diagnose.ts) only when no Capability
 * object exists for the id at all -- should not happen post-Phase-2 for any
 * "capability"/"package"-sourced id, kept only as a compatibility guard so a
 * pre-Capability-index caller still resolves the same way `resolveGflow`
 * always did.
 *
 * Deterministic selection: sorted by Technique ref (`formatRef`, string
 * sort) -- the same tie-break `exactMatches()` already applies to its own
 * hits, so a requirement that used to resolve a single Technique still
 * resolves that exact Technique; one that matches more than one
 * ("duplicate_candidate" in resolve/diagnose.ts) now resolves the lowest ref
 * instead of failing, N:M-capable rather than N:1.
 */
export function resolveCapabilityCandidates(projection: WorldProjection, capabilityId: string): CapabilityCandidate[] {
  const capability = projection.capabilities.get(formatRef(makeRef('capability', capabilityId)));

  const candidates: CapabilityCandidate[] = [];
  if (capability) {
    for (const techRef of capability.implementedBy) {
      const technique = projection.techniques.get(formatRef(techRef));
      if (technique?.providedBy) candidates.push({ technique, agent: technique.providedBy });
    }
  } else {
    for (const technique of exactMatches(projection, capabilityId)) {
      if (technique.source === 'capability' && technique.providedBy) {
        candidates.push({ technique, agent: technique.providedBy });
      }
    }
  }

  return candidates.sort((a, b) => formatRef(a.technique.ref).localeCompare(formatRef(b.technique.ref)));
}
