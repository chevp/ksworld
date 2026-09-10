import type { LabRef, OrderRef, TechniqueRef } from './refs.js';
import type { Lifecycle, Provenance } from './provenance.js';

/**
 * A concrete, already-classified request — entry point of resolution. Real
 * source: a `*.drakar.json` with `"kind":"request"` (the repo calls the
 * file "request", but its `requires:[technique-ids]` make it doc's Order,
 * not doc's raw Request — see model/request.ts for the unclassified form).
 */
export interface Order {
  ref: OrderRef;
  labRef?: LabRef;
  name: string;
  requires: TechniqueRef[];
  path: string;
  provenance: Provenance;
  lifecycle: Lifecycle;
}
