import type { DependencyRelation } from '../graph/dependency.js';
import type { Ref } from '../model/refs.js';

/**
 * Typed operations (doc §5.1). Not file paths and text patches — the
 * writers in mutate/writers/* decide which real file(s) an operation
 * touches. `addDependency`/`removeDependency` are doc §5.1's LINK/UNLINK
 * example, generalized to any two refs and a DependencyRelation.
 */
export type MutationOperation =
  | { kind: 'updateWorkflow'; workflowRef: Ref; path: string; value: unknown }
  | { kind: 'addDependency'; from: Ref; relation: DependencyRelation; to: Ref }
  | { kind: 'removeDependency'; from: Ref; relation: DependencyRelation; to: Ref }
  | { kind: 'replaceTechnique'; from: Ref; oldTechnique: Ref; newTechnique: Ref }
  | { kind: 'attachData'; labId: string; dataRef: Ref }
  | { kind: 'promoteLab'; labId: string; status: string }
  | { kind: 'migrateAction'; actionRef: Ref }
  | {
      kind: 'createAgent';
      labId: string;
      name: string;
      description: string;
      goal: string;
      contextFiles: string[];
      capabilities: string[];
    };

export type MutationOperationKind = MutationOperation['kind'];
