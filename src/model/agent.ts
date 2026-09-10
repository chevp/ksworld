import type { AgentRef, LabRef, TechniqueRef } from './refs.js';
import type { Lifecycle, Provenance } from './provenance.js';

export type AgentSource = 'nexo-agent' | 'drakar';

/**
 * An executable specialist — a Nexo `.agent`/`.order.agent` JSON document
 * (`kind` starting `"agent"`) or a `*.drakar.json` with `"kind":"agent"`.
 * Not named as its own concept in doc §2.2's Concepts table, but the doc's
 * own `Ref<T>` list (§2.4) already types `AgentRef = Ref<"agent">` — this
 * model file fills that gap.
 */
export interface Agent {
  ref: AgentRef;
  labRef?: LabRef;
  source: AgentSource;
  name: string;
  description?: string;
  /** nexo-agent source: `delegates[].agent`, resolved to sibling Agent files. */
  delegatesTo: AgentRef[];
  /** drakar source: `provides[]`, the Techniques this Agent provides. */
  provides: TechniqueRef[];
  /** drakar source: `requires[]` raw capability strings (tool grants, not Technique refs). */
  declaredCapabilities: string[];
  /** Which process executes this Agent. `"claude"` only occurs on `source: 'drakar'` (worldctl-owned format) — the native nexo `agent/1` schema is never extended with this. Default `"nexo"`. */
  runner: 'nexo' | 'claude';
  /** `runner: 'claude'` only — resolved absolute path to this Agent's own Core system-prompt file. `undefined` means "use worldctl's own built-in default" (prompts/promptLoader.ts's `DEFAULT_CORE`). */
  promptPath?: string;
  /** `runner: 'claude'` + `promptPath` only — resolved absolute paths to this Agent's own ordered policy files, always loaded alongside `promptPath`. */
  policyPaths?: string[];
  path: string;
  provenance: Provenance;
  lifecycle: Lifecycle;
}
