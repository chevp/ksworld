import type { AgentRef, LabRef } from './refs.js';
import type { Lifecycle, Provenance } from './provenance.js';

export type AgentSource = 'nexo-agent';

/**
 * An executable specialist — a Nexo `.agent`/`.order.agent` JSON document
 * (`kind` starting `"agent"`). Not named as its own concept in doc §2.2's
 * Concepts table, but the doc's own `Ref<T>` list (§2.4) already types
 * `AgentRef = Ref<"agent">` — this model file fills that gap.
 */
export interface Agent {
  ref: AgentRef;
  labRef?: LabRef;
  source: AgentSource;
  name: string;
  description?: string;
  /** `delegates[].agent`, resolved to sibling Agent files. */
  delegatesTo: AgentRef[];
  /** `requires[]` raw capability strings (tool grants, not Technique refs). */
  declaredCapabilities: string[];
  path: string;
  provenance: Provenance;
  lifecycle: Lifecycle;
}
