import { createColors } from 'picocolors';
import type { Content, ContentArtifact } from '../model/content.js';
import type { Layout } from '../model/layout.js';
import type { ContentAnalysis, MigrationPlanEntry } from '../read/content.js';
import { formatRef } from '../model/refs.js';
import type { InspectResult } from '../read/inspect.js';
import type { SearchHit } from '../read/search.js';
import type { WorldStatus } from '../read/status.js';
import type { ValidationCategory, ValidationIssue } from '../validate/validate.js';
import type { Diff } from '../validate/diff.js';
import type { Proposal } from './proposals.js';
import type { CapabilityDiagnosis } from '../resolve/diagnose.js';

/**
 * picocolors' own default export enables color whenever `platform === "win32"`,
 * regardless of `isTTY` (see node_modules/picocolors/picocolors.js) — when
 * worldctl runs as a subprocess (e.g. an `.eon` `uses: shell` step, its
 * stdout captured and re-logged by eon.exe, not a real terminal), that leaks
 * raw `\x1b[...m` escapes into a log that never renders them. Colors here
 * are gated on an actual TTY, on every platform.
 */
const pc = createColors(process.stdout.isTTY === true);

export function formatInspect(result: InspectResult, explainLines: string[]): string {
  if (!result.object) return pc.red(`not found: ${formatRef(result.ref)}`);
  const lines: string[] = [pc.bold(formatRef(result.ref))];
  for (const [key, value] of Object.entries(result.object)) {
    if (key === 'ref' || key === 'labRef') continue;
    if (value === undefined) continue;
    lines.push(`  ${pc.dim(key)}: ${JSON.stringify(value)}`);
  }
  if (result.edgesFrom.length > 0) {
    lines.push(pc.dim('  edges from:'));
    for (const edge of result.edgesFrom) lines.push(`    ${edge.relation} -> ${formatRef(edge.to)}`);
  }
  if (result.edgesTo.length > 0) {
    lines.push(pc.dim('  edges to:'));
    for (const edge of result.edgesTo) lines.push(`    ${formatRef(edge.from)} -> ${edge.relation}`);
  }
  for (const line of explainLines) lines.push(pc.yellow(`  ! ${line}`));
  return lines.join('\n');
}

export function formatSearchHits(hits: SearchHit[]): string {
  if (hits.length === 0) return pc.dim('no matches');
  return hits.map((hit) => `${formatRef(hit.ref)}${hit.summary ? pc.dim(`  — ${hit.summary}`) : ''}`).join('\n');
}

/** Human-readable twin of `diagnose <capability>`'s `--json` output -- same object, formatted for a terminal/log instead of a coding agent. */
export function formatDiagnosis(diagnosis: CapabilityDiagnosis): string {
  const label = diagnosis.requirement_id ? `${diagnosis.requirement_id} (${diagnosis.capability})` : diagnosis.capability;

  const lines = [pc.yellow(`Warning: ${label}: ${diagnosis.reason} -- ${diagnosis.type}.`)];
  if (diagnosis.implementation) {
    lines.push('', 'Technique implementation specification:', JSON.stringify(diagnosis.implementation, null, 2));
  }
  if (diagnosis.required_extension) {
    lines.push('', 'Required protocol extension:', JSON.stringify(diagnosis.required_extension, null, 2));
  }
  return lines.join('\n');
}

function statusColor(status: string | undefined): string {
  if (status === 'verified') return pc.green(status);
  if (!status) return pc.dim('(no status)');
  return pc.yellow(status);
}

export function formatContentList(items: Content[]): string {
  if (items.length === 0) return pc.dim('no Content found');
  return items
    .map((c) => `${formatRef(c.ref)}  [${statusColor(c.status)}]${c.role ? pc.dim(`  — ${c.role}`) : ''}`)
    .join('\n');
}

export function formatContentInspect(content: Content, artifacts: ContentArtifact[], usages: string[]): string {
  const lines: string[] = [pc.bold(formatRef(content.ref))];
  if (content.category) lines.push(`  category:  ${content.category}`);
  lines.push(`  status:    ${statusColor(content.status)}`);
  if (content.role) lines.push(`  role:      ${content.role}`);
  lines.push(pc.dim('  artifacts:'));
  for (const a of artifacts) lines.push(`    ${pc.dim(`[${a.role}]`)} ${a.path}`);
  if (usages.length > 0) {
    lines.push(pc.dim('  used by:'));
    for (const u of usages) lines.push(`    ${u}`);
  } else {
    lines.push(pc.dim('  used by:   (no levels/**/placements.json reference this id)'));
  }
  return lines.join('\n');
}

export function formatContentArtifacts(artifacts: ContentArtifact[]): string {
  if (artifacts.length === 0) return pc.dim('no artifacts resolved');
  return artifacts.map((a) => `${pc.dim(`[${a.role}]`)} ${a.path}`).join('\n');
}

export function formatLayoutList(items: Layout[]): string {
  if (items.length === 0) return pc.dim('no Layout found');
  return items
    .map((l) => `${formatRef(l.ref)}  [${l.nodeCount} node(s), ${l.edgeCount} edge(s)]${l.name ? pc.dim(`  — ${l.name}`) : ''}`)
    .join('\n');
}

export function formatLayoutInspect(layout: Layout): string {
  const lines: string[] = [pc.bold(formatRef(layout.ref))];
  if (layout.name) lines.push(`  name:   ${layout.name}`);
  lines.push(`  nodes:  ${layout.nodeCount}`);
  lines.push(`  edges:  ${layout.edgeCount}`);
  lines.push(`  path:   ${layout.path}`);
  return lines.join('\n');
}

export function formatContentRefs(content: Content, usages: string[]): string {
  if (usages.length === 0) return pc.dim(`${formatRef(content.ref)} — not referenced by any levels/**/placements.json`);
  return usages.join('\n');
}

export function formatContentAnalysis(analysis: ContentAnalysis): string {
  const lines: string[] = [
    pc.bold('content analyze'),
    `  total objects:     ${analysis.totalObjects}`,
    `  with manifest:     ${analysis.withManifest}`,
    `  without manifest:  ${analysis.withoutManifest}`,
  ];
  if (analysis.issues.length === 0) {
    lines.push(pc.green('  no issues found'));
    return lines.join('\n');
  }
  const byKind = new Map<string, number>();
  for (const issue of analysis.issues) byKind.set(issue.kind, (byKind.get(issue.kind) ?? 0) + 1);
  lines.push(pc.dim('  issues by kind:'));
  for (const [kind, count] of byKind) lines.push(`    ${kind}: ${count}`);
  lines.push(pc.dim('  detail:'));
  for (const issue of analysis.issues) lines.push(`    [${pc.yellow(issue.kind)}] ${issue.ref} -- ${issue.detail}`);
  return lines.join('\n');
}

export function formatMigrationPlan(plan: MigrationPlanEntry[]): string {
  if (plan.length === 0) return pc.green('nothing to migrate -- canonical model already consistent');
  const lines: string[] = [pc.bold(`migration plan -- ${plan.length} object(s)`)];
  for (const entry of plan) {
    lines.push('');
    lines.push(pc.bold(entry.ref));
    lines.push(pc.dim('  CURRENT:'));
    for (const p of entry.current) lines.push(`    ${p}`);
    lines.push(pc.dim('  TARGET:'));
    for (const p of entry.target) lines.push(`    ${p}`);
    lines.push(pc.dim('  CHANGES:'));
    for (const c of entry.changes) lines.push(`    ${c}`);
    lines.push(pc.dim('  DELETE:'));
    if (entry.deletes.length === 0) lines.push(`    (none)`);
    for (const d of entry.deletes) lines.push(`    ${d}`);
    lines.push(pc.dim('  REASON:'));
    lines.push(`    ${entry.reason}`);
  }
  return lines.join('\n');
}

/** Fixed display order -- a cache-only or technique-run-evidence issue never mixes in among
 *  source defects, even when both are present (software-architecture-description.md's
 *  2026-09-09 addendum: "a cache-only issue must never read like a source defect"). */
const CATEGORY_ORDER: ValidationCategory[] = ['source', 'references', 'technique-runs', 'derived', 'cache'];

export function formatIssues(issues: ValidationIssue[]): string {
  if (issues.length === 0) return pc.green('no issues');
  const lines: string[] = [];
  for (const category of CATEGORY_ORDER) {
    const inCategory = issues.filter((issue) => issue.category === category);
    if (inCategory.length === 0) continue;
    lines.push(pc.bold(category));
    for (const issue of inCategory) {
      const label = issue.severity === 'error' ? pc.red('error') : pc.yellow('warning');
      lines.push(`  [${label}] ${issue.message}`);
    }
  }
  return lines.join('\n');
}

export function formatDiff(diff: Diff): string {
  return diff.lines
    .map((line) => {
      const color = line.sign === '+' ? pc.green : line.sign === '-' ? pc.red : pc.yellow;
      return color(`${line.sign} ${line.text}`);
    })
    .join('\n');
}

export function formatProposal(proposal: Proposal): string {
  return [
    formatDiff(proposal.diff),
    '',
    pc.bold(`proposal: ${proposal.id}`) + pc.dim(`   (pending — run \`ksworld apply ${proposal.id}\` to persist)`),
  ].join('\n');
}

export function formatStatus(status: WorldStatus, pendingProposals: number): string {
  const lines: string[] = [pc.bold('ksworld')];
  lines.push(`  ${pc.dim('root')}        ${status.root}`);
  if (status.scope) lines.push(`  ${pc.dim('scope')}       ${status.scope}`);
  lines.push(`  ${pc.dim('reachable')}   ${status.reachable ? pc.green('yes') : pc.red('no')}`);

  lines.push('');
  lines.push(pc.bold('world'));
  const counts = status.counts;
  lines.push(`  ${pc.bold('catalog')}${pc.dim('  -- available capability surface')}`);
  for (const [label, value] of Object.entries(counts.catalog)) {
    lines.push(`    ${pc.dim(label.padEnd(10))} ${value}`);
  }
  lines.push(`  ${pc.bold('authored')}${pc.dim('  -- real domain objects')}`);
  for (const [label, value] of Object.entries(counts.authored)) {
    lines.push(`    ${pc.dim(label.padEnd(10))} ${value}`);
  }
  lines.push(`  ${pc.dim('techniqueRuns'.padEnd(10))} ${counts.techniqueRuns}${pc.dim('  -- pipe25d Technique Run evidence')}`);
  lines.push(`  ${pc.dim('capabilities'.padEnd(10))} ${counts.capabilities}${pc.dim('  -- WHAT layer, derived from techniques')}`);

  lines.push('');
  lines.push(pc.bold('validation'));
  lines.push(`  ${pc.dim('errors')}      ${status.errors > 0 ? pc.red(String(status.errors)) : pc.green('0')}`);
  lines.push(`  ${pc.dim('warnings')}    ${status.warnings > 0 ? pc.yellow(String(status.warnings)) : pc.green('0')}`);
  if (status.errors > 0 || status.warnings > 0) lines.push(`  ${pc.dim('(run `ksworld validate` for details)')}`);

  lines.push('');
  lines.push(pc.bold('proposals'));
  lines.push(`  ${pc.dim('pending')}     ${pendingProposals > 0 ? pc.cyan(String(pendingProposals)) : pc.dim('0')}`);

  lines.push('');
  lines.push(pc.bold('token usage') + pc.dim('  -- real `claude -p` completions, nexo-run Agents excluded (no data)'));
  const usageEntries = Object.entries(status.usage.byModel);
  if (usageEntries.length === 0) {
    lines.push(`  ${pc.dim('(none recorded -- see .worldctl/usage.jsonl)')}`);
  } else {
    for (const [model, totals] of usageEntries.sort(([a], [b]) => a.localeCompare(b))) {
      const totalTokens = totals.inputTokens + totals.outputTokens + totals.cacheCreationInputTokens + totals.cacheReadInputTokens;
      lines.push(
        `  ${pc.cyan(model.padEnd(24))} ${String(totals.calls).padStart(3)} calls   ${String(totalTokens).padStart(8)} tokens   ${pc.dim(`(in ${totals.inputTokens} / out ${totals.outputTokens} / cache ${totals.cacheCreationInputTokens + totals.cacheReadInputTokens})`)}   $${totals.costUsd.toFixed(4)}`,
      );
    }
    lines.push(`  ${pc.dim('total'.padEnd(24))}      ${pc.bold(`$${status.usage.totalCostUsd.toFixed(4)}`)}`);
  }

  return lines.join('\n');
}

