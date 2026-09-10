import type { OrderRef, Ref } from '../model/refs.js';
import { formatRef } from '../model/refs.js';
import type { WorldProjection } from '../persistence/index.js';
import { routeOrder } from '../resolve/order.js';

/**
 * QUERIES, never writes (doc §5's ASCII diagram lists `explain` alongside
 * `read`/`search`/`graph`/`impact`; §8.1 has no dedicated CLI command for
 * it, so `inspect` calls this for extra rationale lines on refs where it
 * has something non-obvious to say).
 */
export async function explain(projection: WorldProjection, ref: Ref): Promise<string[]> {
  const lines: string[] = [];

  if (ref.kind === 'order') {
    const workflowRef = await routeOrder(projection, ref as OrderRef);
    lines.push(workflowRef ? `routes to ${formatRef(workflowRef)}` : 'no Workflow route found (doc §2.2 Route)');
  }

  if (ref.kind === 'technique') {
    const technique = projection.techniques.get(formatRef(ref));
    if (technique?.source === 'capability' && !technique.providedBy) {
      lines.push('capability declares no resolved provider — its source.path matched no known Agent');
    }
  }

  return lines;
}
