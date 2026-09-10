import path from 'node:path';
import type { RecipeRef, TechniqueRef, WorkflowRef } from '../model/refs.js';
import { formatRef } from '../model/refs.js';
import type { WorldProjection } from '../persistence/index.js';

export interface WorkflowResolution {
  techniques: TechniqueRef[];
  recipes: RecipeRef[];
}

/**
 * A Workflow's own composition decision (doc §2.2: "chooses a Recipe
 * and/or Technique"). Techniques come straight from the Workflow object's
 * already-computed `requires` (persistence/index.ts's `--step` scan).
 * Recipes are found the same best-effort way: a job step's `run` string
 * naming a `*.recipe.eon` file this Lab also owns.
 */
export function resolveWorkflow(projection: WorldProjection, workflowRef: WorkflowRef): WorkflowResolution {
  const workflow = projection.workflows.get(formatRef(workflowRef));
  if (!workflow) return { techniques: [], recipes: [] };

  const recipes: RecipeRef[] = [];
  const recipesByPath = new Map([...projection.recipes.values()].map((recipe) => [path.resolve(recipe.path), recipe.ref] as const));
  for (const job of workflow.jobs) {
    for (const step of job.steps) {
      if (!step.run) continue;
      for (const [recipePath, recipeRef] of recipesByPath) {
        if (step.run.includes(path.basename(recipePath))) recipes.push(recipeRef);
      }
    }
  }

  return { techniques: workflow.requires, recipes };
}
