import type { OrderRef, WorkflowRef } from '../model/refs.js';
import { formatRef } from '../model/refs.js';
import { readSidecarJson } from '../mutate/writers/sidecar-writer.js';
import type { WorldProjection } from '../persistence/index.js';

/**
 * Route (doc §2.2/§3): which Workflow resolves a given Order. Not
 * persisted by any real file — this is a v1 heuristic, weakest link in the
 * pipeline: (1) an explicit `worldctl propose change-route` override
 * recorded in any Lab's `.kosmos/worldctl/routes.json` (keyed by the Order's own
 * `name`, first match across all Labs wins), else (2) the Order's own Lab's
 * `*.build.eon` Workflow, else (3) the Order's own Lab's first
 * drakar-sourced Workflow.
 */
export async function routeOrder(projection: WorldProjection, orderRef: OrderRef): Promise<WorkflowRef | undefined> {
  const order = projection.orders.get(formatRef(orderRef));
  if (!order) return undefined;

  for (const lab of projection.labs.values()) {
    const routes = await readSidecarJson<Record<string, string>>(lab.dir, 'routes.json', {});
    const override = routes[order.name];
    if (override) {
      const target = projection.workflows.get(override);
      if (target) return target.ref;
    }
  }

  // No Lab context on the Order -> no "same Lab" Workflow is possible; Tier 1 (routes.json)
  // above is still checked, this just skips straight past Tier 2/3 to the undefined fallback.
  const sameLabWorkflows = order.labRef
    ? [...projection.workflows.values()].filter((w) => w.labRef?.id === order.labRef!.id)
    : [];
  const buildWorkflow = sameLabWorkflows.find((w) => w.category === 'build');
  if (buildWorkflow) return buildWorkflow.ref;

  const drakarWorkflow = sameLabWorkflows.find((w) => w.source === 'drakar');
  if (drakarWorkflow) return drakarWorkflow.ref;

  return undefined;
}
