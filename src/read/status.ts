import type { LabRef } from '../model/refs.js';
import { formatRef } from '../model/refs.js';
import type { WorldProjection } from '../persistence/index.js';
import type { UsageSummary } from './usage.js';
import { readUsageSummary } from './usage.js';
import { stat } from '../util/traced-fs.js';
import { validateWorld } from '../validate/validate.js';

export interface WorldStatus {
  root: string;
  /** Set when scoped to one Lab (doc §8.1's cwd-detection) — undefined for the whole world. */
  scope?: string;
  reachable: boolean;
  counts: {
    /** Descriptive/available capability surface — what COULD be used, not what was. */
    catalog: {
      labs: number;
      techniques: number;
      workflows: number;
      agents: number;
      actions: number;
      launchers: number;
      data: number;
    };
    /** Real authored domain objects (parsed from real `*.recipe.eon`/`*.wish.md` files) —
     *  deliberately NOT implied to be caused by `catalog` above (a large `techniques`/
     *  `workflows` count says nothing about how many Recipes/Requests exist; see
     *  software-architecture-description.md's 2026-09-09 addendum). */
    authored: {
      recipes: number;
      requests: number;
    };
    /** Evidence that a pipe25d Technique actually ran (`model/techniqueRun.ts`) —
     *  `provenance: 'technique_run'`, not authored, not part of the catalog surface. */
    techniqueRuns: number;
    /** The WHAT layer next to `catalog.techniques`' HOW (model/capability.ts) — derived, not authored. */
    capabilities: number;
  };
  errors: number;
  warnings: number;
  /** Token usage summed from `<root>/.worldctl/usage.jsonl` (see `read/usage.ts`). */
  usage: UsageSummary;
}

/**
 * QUERIES, never writes (doc §5). `reachable` is checked directly — an unreachable
 * root still yields an (empty) projection, since persistence/walk.ts swallows readdir
 * failures. `ref` narrows counts and validation to one Lab (see cli/cwd-scope.ts) —
 * the root is still walked in full either way, only the report narrows.
 */
export async function status(projection: WorldProjection, ref?: LabRef): Promise<WorldStatus> {
  const reachable = await stat(projection.root)
    .then((s) => s.isDirectory())
    .catch(() => false);
  const issues = await validateWorld(projection, ref);
  const usage = await readUsageSummary(projection.root);

  const count = (map: Map<string, { labRef?: LabRef }>): number =>
    ref ? [...map.values()].filter((o) => o.labRef?.id === ref.id).length : map.size;

  return {
    root: projection.root,
    scope: ref ? formatRef(ref) : undefined,
    reachable,
    counts: {
      catalog: {
        labs: ref ? 1 : projection.labs.size,
        techniques: count(projection.techniques),
        workflows: count(projection.workflows),
        agents: count(projection.agents),
        actions: count(projection.actions),
        launchers: count(projection.launchers),
        data: count(projection.data),
      },
      authored: {
        recipes: count(projection.recipes),
        requests: count(projection.requests),
      },
      techniqueRuns: count(projection.techniqueRuns),
      // Capability has no labRef (implementedBy spans Labs by construction) -- always
      // whole-world, never narrowed by `ref` the way count()'s other callers are.
      capabilities: projection.capabilities.size,
    },
    errors: issues.filter((issue) => issue.severity === 'error').length,
    warnings: issues.filter((issue) => issue.severity === 'warning').length,
    usage,
  };
}
