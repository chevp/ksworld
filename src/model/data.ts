import type { DataRef, LabRef } from './refs.js';
import type { Lifecycle, Provenance } from './provenance.js';

export type DataSource = 'registry' | 'schema' | 'population';

/**
 * Input/Asset/State/Output (doc §2.2, kept as one RESOURCE ref kind in v1).
 * Real sources: `*.registry.json`, `*.schema.json`, or a `*.drakar.json`
 * with `"kind":"population"` (treated as State — a roster snapshot).
 */
export interface Data {
  ref: DataRef;
  labRef?: LabRef;
  source: DataSource;
  name: string;
  path: string;
  provenance: Provenance;
  lifecycle: Lifecycle;
}
