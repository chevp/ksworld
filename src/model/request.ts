import type { LabRef, RequestRef } from './refs.js';
import type { Lifecycle, Provenance } from './provenance.js';

/**
 * Raw, not-yet-classified input an Order is derived from (doc §2.2). Real
 * source: `orders/wish.md` or any `*.wish.md` — free-form prose, no
 * structured fields beyond its text.
 */
export interface Request {
  ref: RequestRef;
  labRef?: LabRef;
  text: string;
  path: string;
  provenance: Provenance;
  lifecycle: Lifecycle;
}
