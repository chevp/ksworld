import { readFile } from 'node:fs/promises';
import { formatRef } from '../model/refs.js';
import type { MutationOperation } from '../mutate/operations.js';
import { readSidecarJson } from '../mutate/writers/sidecar-writer.js';
import { parseYamlFile } from '../persistence/parsers/yaml.js';
import type { WorldProjection } from '../persistence/index.js';

export interface DiffLine {
  sign: '+' | '-' | '~';
  text: string;
}

export interface Diff {
  lines: DiffLine[];
}

function getIn(obj: unknown, segments: string[]): unknown {
  let current = obj;
  for (const segment of segments) {
    if (typeof current !== 'object' || current === null) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

/**
 * ANALYSIS, never writes (doc §5.2's "preview diff" step). Operation-
 * specific rather than a generic before/after projection tree-diff: each
 * operation kind knows exactly which file(s) and field(s) it would touch,
 * so this reads just enough of current state to show old -> new.
 */
export async function computeDiff(projection: WorldProjection, operation: MutationOperation): Promise<Diff> {
  const lines: DiffLine[] = [];

  switch (operation.kind) {
    case 'createOrder': {
      lines.push({ sign: '+', text: `order.${operation.labId}.${operation.id}  requires  [${operation.requires.join(', ')}]` });
      break;
    }

    case 'updateWorkflow': {
      const workflow = projection.graph.resolve(operation.workflowRef) as { path: string } | undefined;
      const oldValue = workflow ? getIn(await parseYamlFile(workflow.path), operation.path.split('.')) : undefined;
      lines.push({
        sign: '~',
        text: `${formatRef(operation.workflowRef)}  ${operation.path}  ${JSON.stringify(oldValue)} -> ${JSON.stringify(operation.value)}`,
      });
      break;
    }

    case 'addDependency':
    case 'removeDependency': {
      const sign = operation.kind === 'addDependency' ? '+' : '-';
      lines.push({ sign, text: `${formatRef(operation.from)}  ${operation.relation}  ${formatRef(operation.to)}` });
      break;
    }

    case 'replaceTechnique': {
      lines.push({
        sign: '~',
        text: `${formatRef(operation.from)}  ${formatRef(operation.oldTechnique)} -> ${formatRef(operation.newTechnique)}`,
      });
      break;
    }

    case 'attachData': {
      lines.push({ sign: '+', text: `${operation.labId}  attachedData  ${formatRef(operation.dataRef)}` });
      break;
    }

    case 'changeRoute': {
      const workflow = projection.graph.resolve(operation.workflowRef) as { labRef: { id: string } } | undefined;
      const lab = workflow ? projection.labs.get(workflow.labRef.id) : undefined;
      const routes = lab ? await readSidecarJson<Record<string, string>>(lab.dir, 'routes.json', {}) : {};
      lines.push({
        sign: '~',
        text: `route[${operation.orderKind}]  ${routes[operation.orderKind] ?? '(unset)'} -> ${formatRef(operation.workflowRef)}`,
      });
      break;
    }

    case 'promoteLab': {
      const lab = projection.labs.get(operation.labId);
      const current = lab ? await readSidecarJson<{ status?: string }>(lab.dir, 'lab.json', {}) : {};
      lines.push({ sign: '~', text: `${operation.labId}.status  ${current.status ?? '(unset)'} -> ${operation.status}` });
      break;
    }

    case 'migrateAction': {
      const action = projection.graph.resolve(operation.actionRef) as { path: string; format: string } | undefined;
      if (!action) {
        lines.push({ sign: '~', text: `${formatRef(operation.actionRef)}  not found` });
        break;
      }
      lines.push({
        sign: '~',
        text: `${formatRef(operation.actionRef)}  format  ${action.format} -> ${action.format === 'json' ? 'json (no change)' : 'json'}`,
      });
      break;
    }

    case 'createCapability': {
      lines.push({
        sign: '+',
        text: `technique.${operation.labId}.${operation.id}  (capability)  ${operation.description}`,
      });
      break;
    }

    case 'createAgent': {
      const kindLabel = operation.runner === 'claude' ? 'agent, runner: claude' : 'agent/1';
      lines.push({
        sign: '+',
        text: `agent.${operation.labId}.${operation.name}  (${kindLabel})  ${operation.description}`,
      });
      break;
    }

    case 'updateCapabilitySource': {
      const technique = projection.techniques.get(formatRef(operation.techniqueRef)) as { path: string } | undefined;
      const oldSource = technique ? getIn(JSON.parse(await readFile(technique.path, 'utf-8')), ['source']) : undefined;
      lines.push({
        sign: '~',
        text: `${formatRef(operation.techniqueRef)}  source  ${JSON.stringify(oldSource)} -> ${JSON.stringify(operation.source)}`,
      });
      break;
    }

    default: {
      const exhaustive: never = operation;
      throw new Error(`unknown operation ${JSON.stringify(exhaustive)}`);
    }
  }

  return { lines };
}
