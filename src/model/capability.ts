import type { CapabilityRef, TechniqueRef } from './refs.js';

/**
 * The WHAT layer next to Technique's HOW (technique.ts's own doc comment).
 * Derived, never authored: persistence/index.ts builds one Capability per
 * distinct id claimed by a "package"-sourced Technique's `capabilityId` --
 * there is no capability file format of its own yet. `implementedBy` is
 * N:M: more than one Technique, even across Labs, may claim the same id.
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
}
