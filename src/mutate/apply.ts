import { formatRef } from '../model/refs.js';
import type { WorldProjection } from '../persistence/index.js';
import { migrateActionToJson } from './writers/action-writer.js';
import { createAgentDocument, createClaudeAgentDocument, createDrakarCapability, createDrakarRequest, patchAgentDocument } from './writers/agent-writer.js';
import { patchEonYaml, replaceEonStepReference } from './writers/eon-writer.js';
import { readSidecarJson, writeSidecarJson } from './writers/sidecar-writer.js';
import type { MutationOperation } from './operations.js';

function requireLab(projection: WorldProjection, labId: string) {
  const lab = projection.labs.get(labId);
  if (!lab) throw new Error(`no such lab "${labId}"`);
  return lab;
}

/**
 * Persists one approved MutationOperation (doc §5.2's `persist` step) and
 * returns every file path it wrote. The caller (persistence/repository.ts)
 * re-derives the projection from these writes afterward — this function
 * never mutates `projection` in place.
 */
export async function applyMutation(projection: WorldProjection, operation: MutationOperation): Promise<string[]> {
  switch (operation.kind) {
    case 'createOrder': {
      const lab = requireLab(projection, operation.labId);
      const filePath = await createDrakarRequest(lab.dir, operation.id, operation.requires);
      return [filePath];
    }

    case 'updateWorkflow': {
      const workflow = projection.graph.resolve(operation.workflowRef);
      if (!workflow || !('source' in workflow)) throw new Error(`no such workflow "${formatRef(operation.workflowRef)}"`);
      if ((workflow as { source: string }).source !== 'eon') {
        throw new Error(`updateWorkflow is only supported for eon-sourced workflows, not "${formatRef(operation.workflowRef)}"`);
      }
      const filePath = (workflow as { path: string }).path;
      await patchEonYaml(filePath, operation.path, operation.value);
      return [filePath];
    }

    case 'addDependency':
    case 'removeDependency': {
      const isAdd = operation.kind === 'addDependency';
      if (operation.from.kind === 'agent' && operation.relation === 'delegatesTo') {
        const agent = projection.agents.get(formatRef(operation.from));
        if (!agent) throw new Error(`no such agent "${formatRef(operation.from)}"`);
        if (agent.source !== 'nexo-agent') throw new Error(`delegatesTo edits are only supported for nexo-agent documents`);
        const target = projection.graph.resolve(operation.to);
        if (!target) throw new Error(`no such ref "${formatRef(operation.to)}"`);
        const targetName = (target as { name: string }).name;
        await patchAgentDocument(agent.path, (doc) => {
          const delegates = Array.isArray(doc.delegates) ? (doc.delegates as Array<Record<string, unknown>>) : [];
          const targetPath = (target as { path: string }).path;
          if (isAdd) {
            delegates.push({ id: targetName, agent: targetPath });
          } else {
            const idx = delegates.findIndex((d) => d.agent === targetPath);
            if (idx >= 0) delegates.splice(idx, 1);
          }
          doc.delegates = delegates;
        });
        return [agent.path];
      }
      if (operation.from.kind === 'order' && operation.relation === 'requires') {
        const order = projection.orders.get(formatRef(operation.from));
        if (!order) throw new Error(`no such order "${formatRef(operation.from)}"`);
        const target = projection.graph.resolve(operation.to);
        const capabilityId = target ? (target as { name: string }).name : operation.to.id;
        await patchAgentDocument(order.path, (doc) => {
          const requires = Array.isArray(doc.requires) ? (doc.requires as string[]) : [];
          const next = isAdd
            ? requires.includes(capabilityId) ? requires : [...requires, capabilityId]
            : requires.filter((r) => r !== capabilityId);
          doc.requires = next;
        });
        return [order.path];
      }
      throw new Error(`${operation.kind} is not supported for from-kind "${operation.from.kind}" / relation "${operation.relation}" in v1`);
    }

    case 'replaceTechnique': {
      if (operation.from.kind === 'workflow') {
        const workflow = projection.workflows.get(formatRef(operation.from));
        if (!workflow) throw new Error(`no such workflow "${formatRef(operation.from)}"`);
        if (workflow.source !== 'eon') throw new Error(`replaceTechnique is only supported for eon-sourced workflows`);
        const oldTechnique = projection.techniques.get(formatRef(operation.oldTechnique));
        const newTechnique = projection.techniques.get(formatRef(operation.newTechnique));
        if (!oldTechnique || !newTechnique) throw new Error(`unknown technique ref in replaceTechnique`);
        const changed = await replaceEonStepReference(workflow.path, oldTechnique.name, newTechnique.name);
        if (!changed) throw new Error(`"--step ${oldTechnique.name}" not found in ${workflow.path}`);
        return [workflow.path];
      }
      if (operation.from.kind === 'order') {
        const order = projection.orders.get(formatRef(operation.from));
        if (!order) throw new Error(`no such order "${formatRef(operation.from)}"`);
        const oldTechnique = projection.techniques.get(formatRef(operation.oldTechnique));
        const newTechnique = projection.techniques.get(formatRef(operation.newTechnique));
        if (!oldTechnique || !newTechnique) throw new Error(`unknown technique ref in replaceTechnique`);
        await patchAgentDocument(order.path, (doc) => {
          const requires = Array.isArray(doc.requires) ? (doc.requires as string[]) : [];
          doc.requires = requires.map((r) => (r === oldTechnique.name ? newTechnique.name : r));
        });
        return [order.path];
      }
      throw new Error(`replaceTechnique is not supported for from-kind "${operation.from.kind}" in v1`);
    }

    case 'attachData': {
      const lab = requireLab(projection, operation.labId);
      const existing = await readSidecarJson<string[]>(lab.dir, 'data.json', []);
      const refString = formatRef(operation.dataRef);
      const next = existing.includes(refString) ? existing : [...existing, refString];
      const filePath = await writeSidecarJson(lab.dir, 'data.json', next);
      return [filePath];
    }

    case 'changeRoute': {
      const workflow = projection.graph.resolve(operation.workflowRef);
      if (!workflow || !('labRef' in workflow)) throw new Error(`no such workflow "${formatRef(operation.workflowRef)}"`);
      const workflowLabRef = (workflow as { labRef?: { id: string } }).labRef;
      if (!workflowLabRef) throw new Error(`workflow "${formatRef(operation.workflowRef)}" has no Lab -- nowhere to write routes.json`);
      const lab = requireLab(projection, workflowLabRef.id);
      const existing = await readSidecarJson<Record<string, string>>(lab.dir, 'routes.json', {});
      existing[operation.orderKind] = formatRef(operation.workflowRef);
      const filePath = await writeSidecarJson(lab.dir, 'routes.json', existing);
      return [filePath];
    }

    case 'promoteLab': {
      const lab = requireLab(projection, operation.labId);
      const filePath = await writeSidecarJson(lab.dir, 'lab.json', { status: operation.status });
      return [filePath];
    }

    case 'migrateAction': {
      const action = projection.actions.get(formatRef(operation.actionRef));
      if (!action) throw new Error(`no such action "${formatRef(operation.actionRef)}"`);
      const changed = await migrateActionToJson(action.path);
      if (!changed) throw new Error(`${formatRef(operation.actionRef)} is already JSON — nothing to migrate`);
      return [action.path];
    }

    case 'createCapability': {
      const lab = requireLab(projection, operation.labId);
      const filePath = await createDrakarCapability(lab.dir, operation.id, operation.description, operation.source);
      return [filePath];
    }

    case 'createAgent': {
      const lab = requireLab(projection, operation.labId);
      if (operation.runner === 'claude') {
        if (operation.policyFiles?.length && !operation.promptFile) {
          throw new Error('createAgent with runner:"claude": policyFiles requires promptFile');
        }
        const filePath = await createClaudeAgentDocument(
          lab.dir,
          operation.name,
          operation.description,
          operation.capabilities,
          operation.promptFile,
          operation.policyFiles,
        );
        return [filePath];
      }
      const filePath = await createAgentDocument(
        lab.dir,
        operation.name,
        operation.description,
        operation.goal,
        operation.contextFiles,
        operation.capabilities,
      );
      return [filePath];
    }

    case 'updateCapabilitySource': {
      const technique = projection.techniques.get(formatRef(operation.techniqueRef));
      if (!technique) throw new Error(`no such technique "${formatRef(operation.techniqueRef)}"`);
      if (technique.source !== 'capability') {
        throw new Error(`updateCapabilitySource is only supported for capability-sourced techniques, not "${formatRef(operation.techniqueRef)}"`);
      }
      await patchAgentDocument(technique.path, (doc) => {
        doc.source = operation.source;
      });
      return [technique.path];
    }

    default: {
      const exhaustive: never = operation;
      throw new Error(`unknown operation ${JSON.stringify(exhaustive)}`);
    }
  }
}
