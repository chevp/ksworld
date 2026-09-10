import type { LabRef, LayoutRef } from './refs.js';
import type { Lifecycle, Provenance } from './provenance.js';

/**
 * A `.glayout.json` file indexed under a Lab (see docs/plans/glayout-json-
 * format.md) -- worldctl only ever READS this format (`search`/`layout list/
 * find/inspect`), it never writes one. Mirrors `model/content.ts`'s shape:
 * enough to find/describe the file, not to interpret its graph.
 */
export interface Layout {
  ref: LayoutRef;
  labRef?: LabRef;
  /** `graph.name`, when the document sets one. */
  name?: string;
  nodeCount: number;
  edgeCount: number;
  /** Absolute path to the `.glayout.json` file itself. */
  path: string;
  provenance: Provenance;
  lifecycle: Lifecycle;
}
