import type { LabRef, RecipeRef, TechniqueRef } from './refs.js';
import type { Lifecycle, Provenance } from './provenance.js';

/**
 * Concrete, reusable, fixed sequence of Technique applications — a
 * `*.recipe.eon` file. Same shape as a Workflow's job list, kept as a
 * distinct Ref kind because a Recipe never branches (doc §2.2).
 */
export interface Recipe {
  ref: RecipeRef;
  labRef?: LabRef;
  name: string;
  description?: string;
  steps: string[];
  requires: TechniqueRef[];
  path: string;
  provenance: Provenance;
  lifecycle: Lifecycle;
}
