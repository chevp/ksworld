import type { AgentRef, DataRef, OrderRef, TechniqueRef, WorkflowRef } from '../model/refs.js';
import { formatRef } from '../model/refs.js';
import type { WorldProjection } from '../persistence/index.js';
import { routeOrder } from './order.js';
import { resolveDependencies } from './dependencies.js';

/** Nexo (agent runtime, `.agent` documents) vs. Eon (deterministic pipeline executor) — doc §4. */
export type ExecutionTarget = { kind: 'nexo'; agent: AgentRef } | { kind: 'eon'; pipeline: WorkflowRef };

export interface ExecutionPlan {
  order: OrderRef;
  target: ExecutionTarget;
  steps: TechniqueRef[];
  data: DataRef[];
}

/**
 * Runs the pipeline in doc §3 end to end: Order -> Route -> Workflow ->
 * Technique/Data dependencies -> ExecutionPlan with an explicit target.
 * Never executes the plan (doc §8.3) — that is a separate, later step
 * outside world-control (doc §6).
 *
 * Target selection: when every resolved Technique is agent-provided
 * (`source: "capability"`, doc §2.3) the plan targets Nexo via the first
 * such Technique's resolved provider Agent; otherwise it targets Eon via
 * the routed Workflow, matching how the real repo actually executes
 * registry-toml operations (`eon.exe build`) vs. drakar-declared
 * capabilities (an Agent run).
 */
export async function planOrder(projection: WorldProjection, orderRef: OrderRef): Promise<ExecutionPlan> {
  const workflowRef = await routeOrder(projection, orderRef);
  if (!workflowRef) throw new Error(`no Workflow route found for ${formatRef(orderRef)}`);

  const { techniques, data } = await resolveDependencies(projection, orderRef, workflowRef);

  const allCapabilitySourced =
    techniques.length > 0 && techniques.every((ref) => projection.techniques.get(formatRef(ref))?.source === 'capability');

  let target: ExecutionTarget = { kind: 'eon', pipeline: workflowRef };
  if (allCapabilitySourced) {
    const providerAgent = projection.techniques.get(formatRef(techniques[0]))?.providedBy;
    if (providerAgent) target = { kind: 'nexo', agent: providerAgent };
  }

  return { order: orderRef, target, steps: techniques, data };
}
