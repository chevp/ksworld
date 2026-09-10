export const REF_KINDS = [
  'lab',
  'technique',
  'workflow',
  'recipe',
  'agent',
  'action',
  'order',
  'request',
  'data',
  'launcher',
  'content',
  'layout',
  // Evidence that a pipe25d Technique actually ran (a real assets/pipe25d/<id>/<runId>/meta.json)
  // -- provenance: 'technique_run', see model/techniqueRun.ts. Added 2026-09-09, see
  // software-architecture-description.md's addendum near §2.4.
  'techniqueRun',
  // The WHAT layer next to Technique's HOW (model/capability.ts) -- derived from every
  // Technique that claims one (source "capability" by name, source "package" by
  // capabilityId), never authored directly. Added 2026-09-10, see dependency.ts's
  // `implementedBy` relation.
  'capability',
] as const;

export type RefKind = (typeof REF_KINDS)[number];

export interface Ref<T extends RefKind = RefKind> {
  kind: T;
  id: string;
}

export type LabRef = Ref<'lab'>;
export type TechniqueRef = Ref<'technique'>;
export type WorkflowRef = Ref<'workflow'>;
export type RecipeRef = Ref<'recipe'>;
export type AgentRef = Ref<'agent'>;
export type ActionRef = Ref<'action'>;
export type OrderRef = Ref<'order'>;
export type RequestRef = Ref<'request'>;
export type DataRef = Ref<'data'>;
export type LauncherRef = Ref<'launcher'>;
export type ContentRef = Ref<'content'>;
export type LayoutRef = Ref<'layout'>;
export type TechniqueRunRef = Ref<'techniqueRun'>;
export type CapabilityRef = Ref<'capability'>;

/** A true discriminated union (unlike bare `Ref`/`Ref<RefKind>`) — narrows on `.kind` checks. */
export type AnyRef =
  | LabRef
  | TechniqueRef
  | WorkflowRef
  | RecipeRef
  | AgentRef
  | ActionRef
  | OrderRef
  | RequestRef
  | DataRef
  | LauncherRef
  | ContentRef
  | LayoutRef
  | TechniqueRunRef
  | CapabilityRef;

export function isRefKind(value: string): value is RefKind {
  return (REF_KINDS as readonly string[]).includes(value);
}

export function makeRef<T extends RefKind>(kind: T, id: string): Ref<T> {
  return { kind, id };
}

/** Serializes a Ref as `kind.id`, e.g. `technique.world/settlement.build`. */
export function formatRef(ref: Ref): string {
  return `${ref.kind}.${ref.id}`;
}

/**
 * Parses `kind.id` — kind is the segment before the first dot, id is
 * everything after (ids routinely contain further dots, e.g. operation
 * names or drakar capability ids).
 */
export function parseRef(text: string): AnyRef {
  const dot = text.indexOf('.');
  if (dot < 0) {
    throw new Error(`invalid ref "${text}" — expected "<kind>.<id>"`);
  }
  const kind = text.slice(0, dot);
  const id = text.slice(dot + 1);
  if (!isRefKind(kind)) {
    throw new Error(`invalid ref kind "${kind}" in "${text}" — expected one of ${REF_KINDS.join(', ')}`);
  }
  if (id.length === 0) {
    throw new Error(`invalid ref "${text}" — id is empty`);
  }
  return { kind, id } as AnyRef;
}

export function refEquals(a: Ref, b: Ref): boolean {
  return a.kind === b.kind && a.id === b.id;
}
