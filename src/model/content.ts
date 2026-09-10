import type { ContentRef, LabRef } from './refs.js';
import type { Lifecycle, Provenance } from './provenance.js';

/**
 * A materialized, catalogized content object — one real, reusable game/level
 * asset with an owner-verified provenance chain, NOT a Recipe (the authored
 * intent) and NOT a bare file. Real source: `catalog/assets/<id>.json`, a
 * cross-Lab convention already real in at least env-asset-lab
 * (`env-asset-lab.catalog-entry/1`) and east-lab (`east-lab.prop-catalog-
 * entry/1`, documented-compatible, no `$ref` — see env-asset-lab/README.md's
 * own "Beziehung zu east-lab" section) BEFORE this model existed to index
 * it. This does not invent a new manifest; it reads the one each Lab already
 * writes (2026-09-01 finding: neither this file's shape nor its containing
 * `catalog/assets/*.json` files were reachable through any existing Ref kind
 * — `recipe` only matches `*.recipe.eon`, `data` only matches `*.registry
 * .json`/`*.schema.json` — so every env-asset-lab Content object built
 * today was invisible to `worldctl search`/`inspect` until now).
 *
 * `id` is the catalog id verbatim (e.g. `rock.archetype-a`,
 * `vegetation.overgrowth-billboard`) — already a real, stable, cross-file
 * identity every artifact of the object is named after (`build/<id>.*`),
 * not something this model mints.
 */
export interface Content {
  ref: ContentRef;
  labRef?: LabRef;
  /** The catalog entry's own `category` (e.g. "terrain", "vegetation"). */
  category?: string;
  /** The catalog entry's own `status` (e.g. "verified") — NOT re-derived; whatever the last real catalogize run wrote. */
  status?: string;
  /** `identity.role` when present — the one-line human description. */
  role?: string;
  /** Absolute path to the catalog entry itself — the manifest for this object. */
  path: string;
  /** `source.recipe`, resolved to an absolute path, when the entry names one. */
  recipePath?: string;
  /** `source.builtFrost`, resolved to an absolute path, when the entry names one. */
  builtFrostPath?: string;
  provenance: Provenance;
  lifecycle: Lifecycle;
}

/**
 * Deliberately NOT a field on `Content` itself: resolving it means listing
 * `<lab>/build/` (and any `build/sprites/**` nesting), a directory `walk()`
 * (persistence/walk.ts) never descends into on purpose (`SKIP_DIRS` —
 * `build` is Runtime/History/Diagnostics, not indexed by default the way
 * `catalog/assets/*.json` already is). Doing that extra I/O for every
 * Content object on every `worldctl status`/`content list` across 164 Labs
 * would slow down commands that never asked for it. `read/content.ts`'s own
 * `resolveArtifacts()` does this lazily, only for `inspect`/`artifacts`.
 */

export interface ContentArtifact {
  /** What role this file plays, inferred from where it was found — not authoritative, best-effort labelling for `content artifacts`. */
  role: 'catalog-entry' | 'recipe' | 'built-frost' | 'build-output' | 'source-asset';
  path: string;
}
