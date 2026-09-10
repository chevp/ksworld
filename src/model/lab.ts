import type { LabRef, TechniqueRef } from './refs.js';
import type { Lifecycle, Provenance } from './provenance.js';

/**
 * A `labs/**` unit that provides one or more Techniques. Detected by
 * presence of `main.json` (content.build/1), an `operations/registry.json`
 * (operation.registry/1 — JSON only; eon.exe's own `registryIn()` still
 * accepts `.yaml`/`.yml`/`.toml` too, but worldctl only ever writes and
 * looks for `.json`), a direct `README.md` next to one of
 * `orders`/`agents`/`pipelines`/`declarations`/`source`/`components`, or a
 * `.kosmos` dir (tooling-created, not authored — catches a real Lab that
 * has neither of the above yet) — whichever exists first, no nested Labs.
 */
export interface Lab {
  ref: LabRef;
  /** Absolute filesystem path to the Lab directory. */
  dir: string;
  name: string;
  /** `main.json`'s own `lab.description`, when present — one line, the Lab's own claim, not re-derived from README. */
  description?: string;
  /** Which marker file caused this directory to be classified as a Lab. */
  detectedBy: 'main.json' | 'operations-registry' | 'README.md' | 'kosmos-dir' | 'pipe25d-import';
  hasMainJson: boolean;
  hasOperationsRegistry: boolean;
  /** The actual filename found under `operations/` when hasOperationsRegistry
      is true — always `registry.json` (worldctl no longer looks for
      `.yaml`/`.yml`/`.toml` there). */
  operationsRegistryFile?: string;
  readmeSummary?: string;
  /** Absolute paths to built `.lua` files under `<dir>/scripts/` — validate.ts requires a sibling `.schema.json` for each. */
  luaScripts: string[];
  /**
   * Techniques this Lab claims to need from another Lab, resolved from
   * `main.json`'s own `requires[]` — fully-qualified refs (`technique.<labId>
   * .<name>`), because unlike `provides.techniques[]` (same-Lab, resolved by
   * bare name) a Lab-level requirement routinely crosses a Lab boundary,
   * where bare names collide. A miss lands in `WorldProjection.unresolved`,
   * not here.
   */
  requires: TechniqueRef[];
  provenance: Provenance;
  lifecycle: Lifecycle;
}
