import type { Ref } from '../model/refs.js';

/**
 * `requires`/`delegatesTo`/`launches` are real, indexed edges (persistence/index.ts).
 * `resolvesThrough`/`consumes`/`produces`/`targets` close a gap between this list and the
 * spec doc (software-architecture-description.md §2.3/§2.4), which has named them for years
 * without code ever adding them -- vocabulary only for now: wiring them as real edges
 * belongs to the resolution pipeline, deliberately out of scope here (see the 2026-09-09
 * addendum near doc §2.4). `producedBy`/`derivedFrom`/`illustrates` are new, added for
 * Technique Run provenance (model/techniqueRun.ts) -- `producedBy` links a TechniqueRun back
 * to the Technique it ran, `illustrates` is the weaker link a REFERENCE-ONLY run record has
 * to a Technique (e.g. tools/worldctl/reference/game-content-template's assets/pipe25d/
 * example artifacts -- evidence of what a run produces, not this project's own provenance),
 * `derivedFrom` is available for any future object that is computed from another rather than
 * hand-authored. `implementedBy` (Capability -> Technique, added 2026-09-10) links a
 * `capability` Ref (model/capability.ts) to the "package"-sourced Techniques that claim it.
 *
 * Deliberately still NOT added, and not planned without a separate decision: `defines`,
 * `references`, `executedBy`, `implements` (the reverse of `implementedBy` -- redundant with
 * Technique's own `capabilityId` field) -- none has a valid Ref-typed target today (a `.gflow`'s
 * "GameRules" still isn't a Ref kind either).
 */
export const DEPENDENCY_RELATIONS = [
  'requires',
  'delegatesTo',
  'launches',
  'resolvesThrough',
  'consumes',
  'produces',
  'targets',
  'producedBy',
  'derivedFrom',
  'illustrates',
  'implementedBy',
] as const;
export type DependencyRelation = (typeof DEPENDENCY_RELATIONS)[number];

/** A typed, explicit edge between two objects in the world graph (doc §2.4). */
export interface DependencyEdge {
  from: Ref;
  relation: DependencyRelation;
  to: Ref;
}
