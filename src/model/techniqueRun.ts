import type { LabRef, TechniqueRef, TechniqueRunRef } from './refs.js';

/**
 * Evidence that a pipe25d Technique actually ran — a real
 * `assets/pipe25d/<technique-id>/<runId>/meta.json` (or `<name>.meta.json` sibling, the other
 * pipe-gen2.5d-lab convention), `schema: 'pipe-gen2.5d-lab/run-meta@1'`. Same detection/field
 * shape as `packages/pipe25d-core/src/runsList.ts`'s `TechniqueRunSummary` — not reinvented, this
 * is worldctl's own indexed copy of the same evidence that tool already reads live.
 *
 * `techniqueRef` is `undefined` when the run's own `technique` id resolves to no known Technique
 * (renamed/removed since the run happened) — indexed anyway, never dropped: the run record is
 * real regardless of whether today's registry still recognizes its id (see `validate.ts`'s
 * matching 'technique-runs'-category warning for this case, not an error — a run predating a
 * rename is not a defect).
 *
 * `illustrative` is set for a run found under `tools/worldctl/reference/game-content-template`'s
 * own `assets/pipe25d/` — REFERENCE ONLY example artifacts (that folder's own README), evidence
 * of what a Technique produces in general, never this indexing run's own provenance. Everywhere
 * else, a `TechniqueRun` is real evidence for whatever project it was found under.
 */
export interface TechniqueRun {
  ref: TechniqueRunRef;
  labRef?: LabRef;
  techniqueRef?: TechniqueRef;
  /** The technique id the run's own meta.json names, verbatim — kept even when techniqueRef could not be resolved. */
  techniqueId: string;
  runId: string;
  ok: boolean;
  createdAt: string;
  summary: string;
  metaPath: string;
  artifacts: { label: string; path: string; kind: string }[];
  illustrative: boolean;
  provenance: 'technique_run';
  lifecycle: 'derived';
  path: string;
}
