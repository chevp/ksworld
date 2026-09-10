import type { AgentRef, LabRef, TechniqueRef } from './refs.js';
import type { Lifecycle, Provenance } from './provenance.js';

export type TechniqueSource = 'registry' | 'capability' | 'main' | 'package' | 'pipe25d';

/**
 * Addressable capability definition. Four real sources: an
 * `operations/registry.json` `operation` entry (deterministic build
 * step), a `*.drakar.json` file with `"kind":"capability"` (agent-provided
 * capability), a Lab's `main.json` `provides.techniques[]` entry (a Lab's
 * OWN claim about what it already provides, e.g. a `*.mechanic.lua` never
 * wrapped in a registry.json operation or a drakar capability -- see
 * docs/capability-catalog.json's "EXISTING_UNREGISTERED" finding for why
 * this third source exists: the file was real, worldctl just had no source
 * that would ever look at it), or a `registry/techniques/*.json` entry --
 * a `cap-tech-pipe-lab`-shaped (schema/technique.schema.json) Node.js
 * package's own declarative Technique Registry (kosmos-quickstarts/
 * cap-tech-pipe-lab/README.md's five-layer architecture: Capability
 * Registry = WHAT, Technique Registry = HOW conceptually). No `kind` field
 * (this registry predates/doesn't use worldctl's kind-is-truth convention,
 * see labs-manifest.md) -- these files are matched by DIRECTORY, exactly
 * like `catalog/assets/*.json` above. Read as evidence pointing at that
 * Lab's own `packages/service-graph-executor`, the same "evidence, not
 * proof" contract as `main.json`'s `provides.techniques[]`: nobody
 * re-verifies the executor actually implements the claim. Capabilities
 * themselves (`registry/capabilities/*.json`, the WHAT layer) are NOT a
 * separate worldctl concept yet -- `capabilityId` below is the one
 * cross-reference into that file, opened directly when needed.
 */
export interface Technique {
  ref: TechniqueRef;
  labRef?: LabRef;
  source: TechniqueSource;
  name: string;
  summary?: string;
  /** registry source only: the runtime the operation invokes (e.g. "python"). */
  runtime?: string;
  /** registry source only: the CLI args passed to that runtime. */
  args?: string;
  /** capability source only: the Agent that declares `provides` this capability. */
  providedBy?: AgentRef;
  /** main source only: absolute path to the real file this technique points at (evidence, not proof — nobody re-verifies it implements the claim). */
  implementation?: string;
  /** package source only: id of this Technique's Capability (registry/capabilities/<id>.json, the WHAT layer this Technique implements). */
  capabilityId?: string;
  /** package source only: artifact kinds this Technique consumes (empty if it starts a pipeline). */
  consumesArtifacts?: string[];
  /** package source only: artifact kinds this Technique produces. */
  producesArtifacts?: string[];
  /** package source only: Profile ids this Technique is preferred for — empty means universal (every Profile). */
  profileAffinity?: string[];
  /** package source only: where this Technique comes from (its own `origin` field, e.g. "cap-tech-pipe-lab Demo, analog pipe-projected-rendering-lab/..."). */
  origin?: string;
  /** pipe25d source only: `@pipe25d/core`'s `Requirement[]` for this Technique (e.g. "eon", "openai", "blender"). */
  requires?: string[];
  /** pipe25d source only: `@pipe25d/core`'s declared `OutputKind[]` for this Technique. */
  outputs?: string[];
  /** pipe25d source only: the Technique's own bare id (`ref.id` is lab-prefixed) -- `/t/<techniqueId>` on its apps/web server. */
  techniqueId?: string;
  /** pipe25d source only: Font Awesome solid class, e.g. "fa-cube". */
  icon?: string;
  /** pipe25d source only: `@pipe25d/core`'s `TechniqueField[]` verbatim -- a consumer (e.g. <pipe25d-technique-runner>) renders its input form from this, no second source needed. */
  fields?: unknown[];
  /** pipe25d source only: `@pipe25d/core`'s free-form notes on what a run actually proves/where its boundary is. */
  notes?: string[];
  path: string;
  provenance: Provenance;
  lifecycle: Lifecycle;
}
