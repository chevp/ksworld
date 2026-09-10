/**
 * How an object came to exist, and how essential/permanent it is — two
 * orthogonal axes, present on every model object (`model/*.ts`).
 *
 * Not the same as a per-kind `source` field (`Technique.source`/
 * `Workflow.source`/`Data.source`) — those name WHICH file-format/location
 * produced an object of a kind that's always hand-authored either way (e.g.
 * a Technique from `operations/registry.json` vs. one from `main.json` are
 * both `provenance: 'authored'`). `Technique.origin` is a third, unrelated
 * field (package-source free text naming where a Technique's OWN registry
 * says it comes from) — not to be confused with this file's vocabulary.
 *
 * Every object indexed before 2026-09-09 is `authored`/`canonical` — nothing
 * in `persistence/index.ts` read anything generated, cached, or produced by
 * a run before `TechniqueRun` (`model/techniqueRun.ts`) was added. See
 * software-architecture-description.md's 2026-09-09 addendum near §2.4.
 */
export type Provenance =
  | 'authored'
  | 'imported'
  | 'generated'
  | 'technique_run'
  | 'build_output'
  | 'cache';

export type Lifecycle =
  | 'canonical'
  | 'derived'
  | 'ephemeral'
  | 'optional';
