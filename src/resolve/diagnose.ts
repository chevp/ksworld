import { formatRef } from '../model/refs.js';
import type { Technique } from '../model/technique.js';
import type { WorldProjection } from '../persistence/index.js';

/**
 * Why a Requirement's capability id does not resolve to a requires-reachable
 * Technique -- worldctl's own diagnosis, never an LLM's. `resolved` is not a
 * gap: the capability already has an agent-provided (`source: "capability"`)
 * Technique with a real provider, i.e. exactly what an Order's `requires[]`
 * needs (persistence/index.ts's `techniquesByCapabilityId`).
 *
 * The other six mirror `docs/ideas/nexo-4-orchestrator`-adjacent triage, but
 * grounded in the four REAL Technique sources (model/technique.ts) instead of
 * invented ones:
 *  - `missing_technique`            no Technique of any source matches at all
 *  - `existing_but_misclassified`   matches a `registry` Technique (a build
 *                                    step) -- exists, but never requires-reachable
 *  - `existing_but_unregistered`    matches a `main` Technique (a Lab's own
 *                                    provides.techniques[] claim) -- real file,
 *                                    no registry/drakar wrapper
 *  - `existing_but_provider_missing` matches a `capability` Technique whose
 *                                    `source.path` resolved no Agent
 *                                    (validate.ts's own existing check)
 *  - `duplicate_candidate`          more than one `capability` Technique
 *                                    claims the same name -- Order resolution
 *                                    silently picks one (`techniquesByCapabilityId`
 *                                    is a Map, last-write-wins)
 *  - `protocol_gap`                 matches only a `package` (cap-tech-pipe-lab
 *                                    style) Technique -- technique.ts's own doc
 *                                    comment: "Capabilities themselves ... are
 *                                    NOT a separate worldctl concept yet"
 */
export const DIAGNOSIS_TYPES = [
  'resolved',
  'missing_technique',
  'existing_but_misclassified',
  'existing_but_unregistered',
  'existing_but_provider_missing',
  'duplicate_candidate',
  'protocol_gap',
] as const;

export type DiagnosisType = (typeof DIAGNOSIS_TYPES)[number];

/** Everything a caller (e.g. a `.gflow`'s compiled `requirements[]` entry) may already know and worldctl does not -- echoed back verbatim, never interpreted. */
export interface RequirementContext {
  id?: string;
  name?: string;
  sourceKey?: string;
  quantity?: number;
  features?: string[];
  dependencies?: string[];
  outputs?: string[];
}

export interface TechniqueMatch {
  ref: string;
  source: Technique['source'];
}

export interface ImplementationSpec {
  name: string;
  id: string;
  kind: 'capability';
  purpose: string;
  scope: { in: string[]; out: string[] };
  contract: {
    inputs: Record<string, unknown>;
    outputs: Record<string, unknown>;
    parameters: Record<string, unknown>;
    artifacts: Record<string, unknown>;
  };
  declaration: {
    kind: 'capability';
    schemaSource: string;
    schema: Record<string, unknown>;
    example: Record<string, unknown>;
  };
  registration: {
    required: true;
    location: string;
    command: string[];
    conventions: string[];
  };
  implementation: {
    language: 'nodejs' | 'unspecified';
    entrypoint: string | null;
    responsibilities: string[];
    constraints: string[];
  };
  verification: {
    required: true;
    checks: string[];
    tests: string[];
  };
  references: { technique: string; reason: string }[];
  /** Explicit, per doc §7/§24: never filled with an invented answer. */
  uncertainties: string[];
}

export interface RequiredExtension {
  gap: string;
  benefitsFrom: string[];
  minimalExtension: string;
}

export interface CapabilityDiagnosis {
  type: DiagnosisType;
  capability: string;
  requirement_id?: string;
  requirement_name?: string;
  reason: string;
  matches: TechniqueMatch[];
  implementation?: ImplementationSpec;
  required_extension?: RequiredExtension;
}

function toMatch(technique: Technique): TechniqueMatch {
  return { ref: formatRef(technique.ref), source: technique.source };
}

/**
 * Exact-match rule, one per Technique source, no fuzzy scoring:
 *  - registry/main/capability: `technique.name === capability` -- ref is
 *    always `<labId>.<name>`, so this is the field equality the RunService.cpp
 *    prefix/suffix trick (`"technique." + labId + "." + capability`) exists to
 *    approximate from a formatted string; here the field is already at hand.
 *  - package: `technique.capabilityId === capability` -- a package Technique's
 *    OWN `name` is its Technique id (e.g. "geometry.generate.default"), not
 *    the capability it fulfills; `capabilityId` is the cross-reference
 *    (technique.ts: "the one cross-reference into that [capability] file").
 */
/** Every Technique whose own name (or, for a `package` source, `capabilityId`) equals `capability` exactly — the one real match rule, shared with `resolve/resolveGflow.ts` so a `.gflow`'s own match loop never reimplements it. */
export function exactMatches(projection: WorldProjection, capability: string): Technique[] {
  const hits: Technique[] = [];
  for (const technique of projection.techniques.values()) {
    const matches = technique.source === 'package' ? technique.capabilityId === capability : technique.name === capability;
    if (matches) hits.push(technique);
  }
  return hits.sort((a, b) => formatRef(a.ref).localeCompare(formatRef(b.ref)));
}

/** Loose, deterministic "closest existing implementation" search for `references[]` (doc §10) -- token overlap on `_`/`.`/`-`-split names, never the exact match itself. */
function findReferences(projection: WorldProjection, capability: string, exclude: Set<string>): { technique: string; reason: string }[] {
  const needleTokens = new Set(capability.split(/[._-]+/).filter(Boolean));
  if (needleTokens.size === 0) return [];

  const scored: { ref: string; reason: string; overlap: number }[] = [];
  for (const technique of projection.techniques.values()) {
    const ref = formatRef(technique.ref);
    if (exclude.has(ref)) continue;
    const nameTokens = new Set(technique.name.split(/[._-]+/).filter(Boolean));
    const overlap = [...needleTokens].filter((t) => nameTokens.has(t)).length;
    if (overlap === 0) continue;
    scored.push({ ref, reason: `shares "${[...needleTokens].filter((t) => nameTokens.has(t)).sort().join(', ')}" with "${capability}"`, overlap });
  }

  return scored
    .sort((a, b) => b.overlap - a.overlap || a.ref.localeCompare(b.ref))
    .slice(0, 3)
    .map(({ ref, reason }) => ({ technique: ref, reason }));
}

function buildImplementationSpec(capability: string, context: RequirementContext, references: { technique: string; reason: string }[]): ImplementationSpec {
  const uncertainties: string[] = [
    'purpose is derived only from the capability id and requirement metadata -- worldctl has no semantic description of what this capability must do',
    'scope.out is empty: nothing in the .gflow requirement or the technique registry states what is explicitly excluded',
    'contract.inputs/outputs are empty: no JSON Schema exists yet for this capability -- see the "world/settlement" fixture convention (a built .lua technique needs a sibling <name>.schema.json, enforced by validate/validate.ts) for the shape a new one should take',
    'registration.location names no Lab: worldctl does not decide which Lab should own a new capability declaration',
  ];

  const sourceClause = context.sourceKey ? ` (source: "${context.sourceKey}"${context.quantity != null ? `, quantity: ${context.quantity}` : ''})` : '';

  return {
    name: capability,
    id: capability,
    kind: 'capability',
    purpose: `Capability "${capability}" is required${sourceClause} but no requires-reachable Technique implements it.`,
    scope: {
      in: [...(context.features ?? [])].sort(),
      out: [],
    },
    contract: {
      inputs: {},
      outputs: {},
      parameters: Object.fromEntries((context.features ?? []).slice().sort().map((f) => [f, { type: 'boolean', description: 'declared true on the source .gflow requirement' }])),
      artifacts: (context.outputs ?? []).length > 0 ? { produces: [...context.outputs!].sort() } : {},
    },
    declaration: {
      kind: 'capability',
      schemaSource: 'src/mutate/writers/agent-writer.ts (createDrakarCapability)',
      schema: {
        kind: 'capability',
        version: 1,
        id: 'string',
        description: 'string',
        source: { type: 'string (e.g. "agent", "registry"; only "agent" resolves a providedBy edge)', path: 'string, relative to the .drakar.json' },
      },
      example: {
        kind: 'capability',
        version: 1,
        id: capability,
        description: `Provides ${capability}.`,
        source: { type: 'agent', path: `../agents/${capability}.agent` },
      },
    },
    registration: {
      required: true,
      location: `<labId>/declarations/capabilities/${capability.replace(/\./g, '-')}.drakar.json`,
      command: [
        `ksworld propose create-capability <labId> ${capability} "Provides ${capability}." --source-type agent --source-path <path-to-.agent-or-implementation>`,
        'ksworld diff <proposalId>',
        'ksworld apply <proposalId>',
      ],
      conventions: ['additive only -- createDrakarCapability refuses to overwrite an existing file', 'wraps an already-real implementation; never invents one'],
    },
    implementation: {
      language: 'nodejs',
      entrypoint: null,
      responsibilities: (context.features ?? []).length > 0 ? [...context.features!].sort() : [`implement "${capability}"`],
      constraints: [
        'deterministic: no LLM call inside the technique itself',
        ...(context.dependencies ?? []).map((d) => `depends on requirement "${d}" being resolved first`),
      ],
    },
    verification: {
      required: true,
      checks: ['ksworld validate <ref> reports no unresolved capability for this id', 'ksworld search technique ' + capability + ' finds a source: "capability" hit with a resolved provider'],
      tests: ['ksworld diagnose ' + capability + ' returns type: "resolved"'],
    },
    references,
    uncertainties,
  };
}

/**
 * Requirement -> Resolution -> Gap Analysis -> Implementation Specification
 * (doc §2). Deterministic: same projection + same `capability`/`context`
 * always produces the same output -- no LLM call, no random id, no
 * timestamp, every list pre-sorted. worldctl only describes; it never writes
 * a Technique, a `.drakar.json`, or touches the `.gflow` this capability came
 * from (doc §18/§19).
 */
export function diagnoseCapability(projection: WorldProjection, capability: string, context: RequirementContext = {}): CapabilityDiagnosis {
  const base: Pick<CapabilityDiagnosis, 'capability' | 'requirement_id' | 'requirement_name'> = {
    capability,
    requirement_id: context.id,
    requirement_name: context.name,
  };

  const hits = exactMatches(projection, capability);
  const exclude = new Set(hits.map((h) => formatRef(h.ref)));

  if (hits.length === 0) {
    return {
      ...base,
      type: 'missing_technique',
      reason: 'no technique found -- unmatched',
      matches: [],
      implementation: buildImplementationSpec(capability, context, findReferences(projection, capability, exclude)),
    };
  }

  const capabilitySourced = hits.filter((h) => h.source === 'capability');

  if (capabilitySourced.length > 1) {
    return {
      ...base,
      type: 'duplicate_candidate',
      reason: `${capabilitySourced.length} capability Techniques all claim "${capability}" -- Order resolution picks one silently (last one indexed wins)`,
      matches: capabilitySourced.map(toMatch),
    };
  }

  if (capabilitySourced.length === 1) {
    const technique = capabilitySourced[0];
    if (!technique.providedBy) {
      return {
        ...base,
        type: 'existing_but_provider_missing',
        reason: `${formatRef(technique.ref)}: capability has no resolved provider (source.path matched no known agent)`,
        matches: [toMatch(technique)],
      };
    }
    return {
      ...base,
      type: 'resolved',
      reason: `${formatRef(technique.ref)} -> ${formatRef(technique.providedBy)}`,
      matches: [toMatch(technique)],
    };
  }

  // No capability-sourced hit: every match is registry/main/package -- real,
  // but none of them is ever reachable through an Order's `requires[]`
  // (persistence/index.ts's techniquesByCapabilityId only indexes `capability`
  // docs). Priority: registry > main > package, since a registry Technique is
  // already build-integrated and one step from `create-capability
  // --source-type registry`; a package Technique needs the protocol
  // acknowledged first (see technique.ts's own doc comment).
  const bySource = (source: Technique['source']) => hits.find((h) => h.source === source);
  const registryHit = bySource('registry');
  const mainHit = bySource('main');
  const packageHit = bySource('package');

  if (registryHit) {
    return {
      ...base,
      type: 'existing_but_misclassified',
      reason: `${formatRef(registryHit.ref)}: matched a registry Technique (a build step), not a capability -- never requires-reachable as-is`,
      matches: hits.map(toMatch),
    };
  }

  if (mainHit) {
    return {
      ...base,
      type: 'existing_but_unregistered',
      reason: `${formatRef(mainHit.ref)}: matched a Lab's own main.json claim, wrapped in neither operations/registry.json nor a *.drakar.json capability`,
      matches: hits.map(toMatch),
    };
  }

  // packageHit
  return {
    ...base,
    type: 'protocol_gap',
    reason: `${formatRef(packageHit!.ref)}: matched a package (cap-tech-pipe-lab-style) Technique -- that registry's own Capability layer is not a worldctl concept yet, so an Order's requires[] cannot reach it`,
    matches: hits.map(toMatch),
    required_extension: {
      gap: 'worldctl indexes package Techniques (model/technique.ts: source "package") but has no matching "package capability" Ref kind or resolution path for requires[]',
      benefitsFrom: hits.map((h) => formatRef(h.ref)),
      minimalExtension: 'either wrap the package Technique in a *.drakar.json capability (same as any other existing implementation), or teach persistence/index.ts to index registry/capabilities/*.json as requires-reachable directly',
    },
  };
}
