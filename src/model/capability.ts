import type { AgentRef, CapabilityRef, TechniqueRef } from './refs.js';

/**
 * The WHAT layer next to Technique's HOW (technique.ts's own doc comment).
 * Derived, never authored: persistence/index.ts builds one Capability per
 * distinct id claimed by a Technique (source "capability" by its `name`,
 * source "package" by its `capabilityId`) -- there is no capability file
 * format of its own yet. `implementedBy` is N:M: more than one Technique,
 * even across Labs/sources, may claim the same id (resolve/diagnose.ts's
 * `duplicate_candidate`). `providedBy` collects the resolved Agent of every
 * "capability"-sourced implementer -- empty when the id is only reachable
 * through a "package" Technique (diagnose.ts's `protocol_gap`).
 *
 * Deliberately excludes "registry"/"main" sourced Techniques whose bare
 * `name` happens to equal an id: `resolve/diagnose.ts::exactMatches()`
 * already covers that broader, looser match for diagnostics -- a
 * Capability's `implementedBy` only ever lists a real capability-shaped
 * implementation.
 */
export interface Capability {
  ref: CapabilityRef;
  id: string;
  implementedBy: TechniqueRef[];
  providedBy: AgentRef[];
}
