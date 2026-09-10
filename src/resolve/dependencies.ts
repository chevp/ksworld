import type { DataRef, OrderRef, Ref, TechniqueRef, WorkflowRef } from '../model/refs.js';
import { formatRef } from '../model/refs.js';
import { readSidecarJson } from '../mutate/writers/sidecar-writer.js';
import type { WorldProjection } from '../persistence/index.js';
import { resolveWorkflow } from './workflow.js';

export class UnresolvedDependencyError extends Error {
  constructor(public readonly ref: Ref) {
    super(`unresolved dependency: ${formatRef(ref)}`);
  }
}

export interface ResolvedDependencies {
  techniques: TechniqueRef[];
  data: DataRef[];
}

/**
 * Each step is a pure resolution against the projection (doc §3) — no side
 * effects. Fails closed: throws `UnresolvedDependencyError` on the first
 * Technique that does not exist in the projection, rather than returning a
 * partial plan.
 */
export async function resolveDependencies(
  projection: WorldProjection,
  orderRef: OrderRef,
  workflowRef: WorkflowRef,
): Promise<ResolvedDependencies> {
  const order = projection.orders.get(formatRef(orderRef));
  if (!order) throw new UnresolvedDependencyError(orderRef);

  const workflowResolution = resolveWorkflow(projection, workflowRef);
  const techniqueRefs = [...order.requires, ...workflowResolution.techniques];
  const seen = new Set<string>();
  const techniques: TechniqueRef[] = [];
  for (const ref of techniqueRefs) {
    const key = formatRef(ref);
    if (seen.has(key)) continue;
    seen.add(key);
    if (!projection.techniques.has(key)) throw new UnresolvedDependencyError(ref);
    techniques.push(ref);
  }

  const lab = order.labRef ? projection.labs.get(order.labRef.id) : undefined;
  const attachedRefStrings = lab ? await readSidecarJson<string[]>(lab.dir, 'data.json', []) : [];
  const data: DataRef[] = attachedRefStrings
    .map((refString) => projection.data.get(refString)?.ref)
    .filter((ref): ref is DataRef => ref !== undefined);

  return { techniques, data };
}
