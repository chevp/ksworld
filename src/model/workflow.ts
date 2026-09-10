import type { LabRef, TechniqueRef, WorkflowRef } from './refs.js';
import type { Lifecycle, Provenance } from './provenance.js';

export type WorkflowSource = 'eon' | 'drakar';

/** Known `<verb>.<category>.eon` category suffixes — metadata only, not a Ref kind. */
export const WORKFLOW_CATEGORIES = ['build', 'generation', 'processing', 'validation', 'runtime'] as const;
export type WorkflowCategory = (typeof WORKFLOW_CATEGORIES)[number];

export interface WorkflowJobStep {
  name?: string;
  uses?: string;
  run?: string;
}

export interface WorkflowJob {
  id: string;
  name?: string;
  needs: string[];
  steps: WorkflowJobStep[];
}

/**
 * Dynamic, rule-based composition: chooses Techniques (and resolves their
 * dependencies) via a `.eon` pipeline (`kosflow/2`/`kosaction/1`, filename
 * not ending `.recipe.eon`) or a `*.drakar.json` with `"kind":"workflow"`.
 */
export interface Workflow {
  ref: WorkflowRef;
  labRef?: LabRef;
  source: WorkflowSource;
  name: string;
  description?: string;
  category?: WorkflowCategory;
  jobs: WorkflowJob[];
  /** Technique refs discovered via `--step <name>` in job step `run` strings, same Lab, best effort. */
  requires: TechniqueRef[];
  path: string;
  provenance: Provenance;
  lifecycle: Lifecycle;
}
