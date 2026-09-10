import type { WorldObject } from '../graph/world-graph.js';
import type { DependencyEdge } from '../graph/dependency.js';
import type { Ref } from '../model/refs.js';
import type { WorldProjection } from '../persistence/index.js';

export interface InspectResult {
  ref: Ref;
  object: WorldObject | undefined;
  edgesFrom: DependencyEdge[];
  edgesTo: DependencyEdge[];
}

/** QUERIES, never writes (doc §5). */
export function inspect(projection: WorldProjection, ref: Ref): InspectResult {
  return {
    ref,
    object: projection.graph.resolve(ref),
    edgesFrom: projection.graph.edgesFrom(ref),
    edgesTo: projection.graph.edgesTo(ref),
  };
}
