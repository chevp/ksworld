import type { ActionRef, LabRef } from './refs.js';
import type { Lifecycle, Provenance } from './provenance.js';

export type ActionFormat = 'json' | 'yaml';

/**
 * A single authorized S3-maturity task (`docs/principles/semantic-maturity.md`):
 * one `uses`/`run`, no jobs, no params, no decision-making — the minimal
 * sibling of a `kosaction/1` step, its own top-level document.
 *
 * Detected by `kind: "execution/1"` in a `*.action` file — formerly `.afrost`,
 * migrating from YAML to JSON (`mutate/writers/action-writer.ts`); worldctl
 * reads both during the transition.
 */
export interface Action {
  ref: ActionRef;
  labRef?: LabRef;
  name: string;
  uses?: string;
  run?: string;
  outputs: Record<string, string>;
  format: ActionFormat;
  path: string;
  provenance: Provenance;
  lifecycle: Lifecycle;
}
