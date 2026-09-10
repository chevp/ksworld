import { existsSync } from 'node:fs';
import path from 'node:path';
import type { Action } from '../model/action.js';
import type { Lab } from '../model/lab.js';
import type { LabRef, Ref } from '../model/refs.js';
import { formatRef, refEquals } from '../model/refs.js';
import type { WorldProjection } from '../persistence/index.js';
import { readFile } from '../util/traced-fs.js';

/**
 * Which kind of thing this issue is about — lets a consumer (e.g. `worldctl validate`'s own
 * output) group issues so a cache-only or technique-run-evidence issue never reads like a
 * defect in hand-authored source. `'derived'`/`'cache'` exist for forward-compatibility
 * (matching `Provenance`'s unused-today values) — nothing produces them yet.
 */
export type ValidationCategory = 'source' | 'derived' | 'references' | 'technique-runs' | 'cache';

export interface ValidationIssue {
  severity: 'error' | 'warning';
  category: ValidationCategory;
  ref?: Ref;
  message: string;
}

/** Splits a shell command line into `"quoted spans"` (quotes kept) and bare words, in order. */
function tokenizeRun(run: string): string[] {
  const tokens: string[] = [];
  const pattern = /"[^"]*"|\S+/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(run))) tokens.push(match[0]);
  return tokens;
}

/**
 * Reference-checks an Action's `run` command against the one placeholder
 * worldctl can resolve on its own: `${root}`, the Action's own Lab dir.
 * Other placeholders (`${mannequin}`, `${iris}`, `${adb}`, ...) name external
 * tool/lab paths this document does not declare and worldctl has no
 * authoritative source for — skipped rather than guessed at. A quoted arg
 * right after `--out`, or one matching a declared `outputs` value, is a
 * declared OUTPUT, not a precondition, and is likewise skipped — outputs
 * (e.g. `eon frost apply`'s positional target) don't need to pre-exist.
 */
function actionReferenceProblems(action: Action, labDir: string): string[] {
  if (action.uses !== 'shell' || !action.run) return [];
  const tokens = tokenizeRun(action.run);
  const problems: string[] = [];
  const outputPaths = new Set(Object.values(action.outputs ?? {}).map((p) => path.normalize(p)));

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (!(token.startsWith('"') && token.endsWith('"'))) continue;
    const inner = token.slice(1, -1);
    if (!inner.includes('${root}')) continue;
    if (/\$\{(?!root\})[^}]+\}/.test(inner)) continue; // another, unresolvable placeholder present
    if (tokens[i - 1] === '--out') continue; // declared output, not a precondition

    const resolved = path.normalize(inner.replace(/\$\{root\}/g, labDir));
    const relative = path.normalize(path.relative(labDir, resolved));
    if (outputPaths.has(relative)) continue; // declared output, not a precondition
    if (!existsSync(resolved)) problems.push(`references "${inner}" (resolved: ${resolved}), which does not exist`);
  }

  return problems;
}

/**
 * Every built `.lua` under a Lab's `scripts/` tree needs a sibling
 * `<name>.schema.json` -- the semantic input/output contract an agent
 * needs to call it. Missing sidecar is an error; a sidecar that isn't
 * valid JSON, or isn't a JSON object at its root, is likewise an error.
 */
async function luaScriptSchemaProblems(lab: Lab): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = [];
  for (const luaPath of lab.luaScripts) {
    const schemaPath = luaPath.replace(/\.lua$/, '.schema.json');
    if (!existsSync(schemaPath)) {
      issues.push({ severity: 'error', category: 'source', ref: lab.ref, message: `${formatRef(lab.ref)}: built Lua script "${luaPath}" has no sibling "${schemaPath}"` });
      continue;
    }
    try {
      const parsed = JSON.parse(await readFile(schemaPath, 'utf-8'));
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        issues.push({ severity: 'error', category: 'source', ref: lab.ref, message: `${formatRef(lab.ref)}: "${schemaPath}" is not a JSON Schema object` });
      }
    } catch (err) {
      issues.push({ severity: 'error', category: 'source', ref: lab.ref, message: `${formatRef(lab.ref)}: "${schemaPath}" is not valid JSON -- ${(err as Error).message}` });
    }
  }
  return issues;
}

function issueMatchesRef(projection: WorldProjection, issue: ValidationIssue, ref: Ref): boolean {
  if (!issue.ref) return false;
  if (refEquals(issue.ref, ref)) return true;
  if (ref.kind === 'lab') {
    const obj = projection.graph.resolve(issue.ref) as { labRef?: LabRef } | undefined;
    return obj?.labRef?.id === ref.id;
  }
  return false;
}

/**
 * ANALYSIS, never writes (doc §5). Surfaces `persistence/index.ts`'s
 * discovered-but-unresolved references (a `.agent` `delegates[]` path with
 * no target, a capability id in `provides`/`requires` that resolves to no
 * Technique) plus Technique-level provenance gaps: no resolved provider, or
 * (the other direction) zero Workflows requiring it, from the SAME `requires`
 * edges buildProjection already computed — no re-read, no subprocess. A
 * Workflow `--step` that names no known Technique is NOT surfaced here —
 * most step names are a lab-specific script's own private dispatch
 * vocabulary, never registered as a Technique at all, so a miss there is
 * expected noise, not a defect. An Agent with an empty `capabilities` array
 * is likewise a free field check, no file re-read.
 * Actions get their own syntax check (`uses`/`run` present) plus a
 * `${root}`-scoped reference check (`actionReferenceProblems`) — the one
 * placeholder every `.action` file's own Lab dir resolves unambiguously.
 * `ref` narrows to one object, or (for a `lab` ref) everything that
 * object's Lab owns. Reference-only — ksworld never shells out to
 * `eon.exe validate`/`nexo.exe validate` (worldctl's own `--native`
 * validation); see README.md for the exact web-safe boundary.
 */
export async function validateWorld(projection: WorldProjection, ref?: Ref): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = [];

  for (const u of projection.unresolved) {
    issues.push({
      severity: 'error',
      category: 'references',
      ref: u.from,
      message: `${formatRef(u.from)}: unresolved ${u.kind} "${u.detail}"`,
    });
  }

  for (const technique of projection.techniques.values()) {
    if (technique.source === 'capability' && !technique.providedBy) {
      issues.push({
        severity: 'warning',
        category: 'references',
        ref: technique.ref,
        message: `${formatRef(technique.ref)}: capability has no resolved provider (source.path matched no known agent)`,
      });
    }
    // Free: `requires` edges into a registry Technique are already computed during
    // buildProjection from every Workflow's `--step <name>` match (persistence/index.ts) —
    // no file re-read, no subprocess. Zero incoming edges = no Workflow ever runs it.
    if (technique.source === 'registry' && projection.graph.edgesTo(technique.ref).length === 0) {
      issues.push({
        severity: 'warning',
        category: 'references',
        ref: technique.ref,
        message: `${formatRef(technique.ref)}: registry Technique "${technique.name}" is not referenced by any Workflow's --step`,
      });
    }
  }

  for (const agent of projection.agents.values()) {
    if (agent.source === 'nexo-agent' && agent.declaredCapabilities.length === 0) {
      issues.push({
        severity: 'warning',
        category: 'source',
        ref: agent.ref,
        message: `${formatRef(agent.ref)}: declares no capabilities`,
      });
    }
  }

  for (const action of projection.actions.values()) {
    if (!action.uses) {
      issues.push({ severity: 'error', category: 'source', ref: action.ref, message: `${formatRef(action.ref)}: no "uses" -- nothing would execute` });
      continue;
    }
    if (action.uses !== 'shell') {
      issues.push({
        severity: 'warning',
        category: 'source',
        ref: action.ref,
        message: `${formatRef(action.ref)}: uses "${action.uses}" -- every other Action in this tree uses "shell"; not verified`,
      });
      continue;
    }
    if (!action.run) {
      issues.push({ severity: 'error', category: 'source', ref: action.ref, message: `${formatRef(action.ref)}: uses: shell with no "run" command` });
      continue;
    }
    const lab = action.labRef ? projection.labs.get(action.labRef.id) : undefined;
    if (!lab) continue;
    for (const problem of actionReferenceProblems(action, lab.dir)) {
      issues.push({ severity: 'error', category: 'references', ref: action.ref, message: `${formatRef(action.ref)}: ${problem}` });
    }
  }

  for (const lab of projection.labs.values()) {
    issues.push(...(await luaScriptSchemaProblems(lab)));
  }

  for (const run of projection.techniqueRuns.values()) {
    if (!run.techniqueRef) {
      issues.push({
        severity: 'warning',
        category: 'technique-runs',
        ref: run.ref,
        message: `${formatRef(run.ref)}: run recorded for unknown technique id "${run.techniqueId}" -- technique may have been renamed/removed since this run`,
      });
    }
  }

  if (!ref) return issues;
  return issues.filter((issue) => issueMatchesRef(projection, issue, ref));
}
