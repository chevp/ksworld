import type { DependencyRelation } from '../graph/dependency.js';
import type { Ref } from '../model/refs.js';

/**
 * Typed operations (doc §5.1). Not file paths and text patches — the
 * writers in mutate/writers/* decide which real file(s) an operation
 * touches. `addDependency`/`removeDependency` are doc §5.1's LINK/UNLINK
 * example, generalized to any two refs and a DependencyRelation.
 */
export type MutationOperation =
  | { kind: 'createOrder'; labId: string; id: string; requires: string[] }
  | { kind: 'updateWorkflow'; workflowRef: Ref; path: string; value: unknown }
  | { kind: 'addDependency'; from: Ref; relation: DependencyRelation; to: Ref }
  | { kind: 'removeDependency'; from: Ref; relation: DependencyRelation; to: Ref }
  | { kind: 'replaceTechnique'; from: Ref; oldTechnique: Ref; newTechnique: Ref }
  | { kind: 'attachData'; labId: string; dataRef: Ref }
  | { kind: 'changeRoute'; orderKind: string; workflowRef: Ref }
  | { kind: 'promoteLab'; labId: string; status: string }
  | { kind: 'migrateAction'; actionRef: Ref }
  | { kind: 'createCapability'; labId: string; id: string; description: string; source?: { type: string; path: string } }
  | {
      kind: 'createAgent';
      labId: string;
      name: string;
      description: string;
      goal: string;
      contextFiles: string[];
      capabilities: string[];
      /** `"claude"` writes a `*.drakar.json` (cli/claude-runner.ts target) instead of a native `.agent`. Default `"nexo"`. */
      runner?: 'nexo' | 'claude';
      /** `runner: 'claude'` only — omit to fall back to worldctl's own built-in default prompt (prompts/promptLoader.ts). See writers/agent-writer.ts's `createClaudeAgentDocument`. */
      promptFile?: string;
      /** `runner: 'claude'` + `promptFile` only — ordered policy files, always loaded alongside `promptFile`. */
      policyFiles?: string[];
    }
  | { kind: 'updateCapabilitySource'; techniqueRef: Ref; source: { type: string; path: string } };

export type MutationOperationKind = MutationOperation['kind'];
