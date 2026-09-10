import type { LabRef, LauncherRef, Ref } from './refs.js';
import type { Lifecycle, Provenance } from './provenance.js';

/**
 * A `.nexo` pointer — `nexo.exe --help`'s own vocabulary: ".eon is the
 * recipe; .agent is the order; .nexo is the pointer to one or the other."
 * NOT worldctl's `order` (model/order.ts, a classified `*.drakar.json`
 * request) — a launch pointer at a Workflow/Recipe or Agent, found both
 * under `orders/` and elsewhere (e.g. a HUD theme's design-task pointer).
 *
 * Four real `kind`s: `nexo/1` (a single `target: {type, path}`), `nexo/2`,
 * `nexo/4` and `nexo/5` (all three an `agent-network` — `network.nodes[]`,
 * resolved here to its `entry` node's Agent; `nexo/4` additionally carries
 * agentic orchestration fields — planning/execution/evaluation/
 * capabilities/etc., see docs/ideas/nexo-4-orchestrator — that worldctl
 * does not interpret; `nexo/5` is `gworld compile`'s deterministic
 * single-entry output, see docs/plans/gworld-nexo-schritt1.md). `targetType`/
 * `targetPath`/`target` describe that resolved Agent/Workflow/Recipe either
 * way.
 */
export interface Launcher {
  ref: LauncherRef;
  labRef?: LabRef;
  name: string;
  description?: string;
  targetType: string;
  targetPath: string;
  /** Resolved to the pointed-at Workflow/Recipe/Agent when that file is also indexed. */
  target?: Ref;
  path: string;
  provenance: Provenance;
  lifecycle: Lifecycle;
}
