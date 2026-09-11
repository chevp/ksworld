import type { Command } from 'commander';
import type { MutationOperation } from '../../mutate/operations.js';
import { computeDiff } from '../../validate/diff.js';
import { formatDiff, formatProposal } from '../format.js';
import { getProposalStore, getRepository, parseList, requireRefKind, requireRefOfKind, requireRelation } from '../context.js';

/** `propose` group (operation -> validate -> preview diff; writes only a Proposal, doc §8.2), plus `diff`/`apply` -- the Proposal lifecycle. */
export function registerProposeCommands(program: Command): void {
  const propose = program.command('propose').description('operation -> validate -> preview diff; writes only a Proposal (doc §8.2)');

  async function submitProposal(operation: MutationOperation): Promise<void> {
    const projection = await getRepository(program).load();
    const diff = await computeDiff(projection, operation);
    const proposal = await getProposalStore(program).save(operation, diff);
    console.log(formatProposal(proposal));
  }

  propose
    .command('link <from> <relation> <to>')
    .description('addDependency(from, relation, to)')
    .action(async (fromText: string, relationText: string, toText: string) => {
      await submitProposal({ kind: 'addDependency', from: requireRefKind(fromText), relation: requireRelation(relationText), to: requireRefKind(toText) });
    });

  propose
    .command('unlink <from> <relation> <to>')
    .description('removeDependency(from, relation, to)')
    .action(async (fromText: string, relationText: string, toText: string) => {
      await submitProposal({ kind: 'removeDependency', from: requireRefKind(fromText), relation: requireRelation(relationText), to: requireRefKind(toText) });
    });

  propose
    .command('update-workflow <workflowRef> <path> <value>')
    .description('updateWorkflow(workflowRef, path, value) — dot-path into the .eon YAML')
    .action(async (workflowRefText: string, path: string, valueText: string) => {
      const workflowRef = requireRefOfKind(workflowRefText, 'workflow', 'a workflow');
      let value: unknown = valueText;
      try {
        value = JSON.parse(valueText);
      } catch {
        // keep as raw string
      }
      await submitProposal({ kind: 'updateWorkflow', workflowRef, path, value });
    });

  propose
    .command('replace-technique <from> <oldTechnique> <newTechnique>')
    .description('replaceTechnique(from, oldTechnique, newTechnique)')
    .action(async (fromText: string, oldText: string, newText: string) => {
      await submitProposal({ kind: 'replaceTechnique', from: requireRefKind(fromText), oldTechnique: requireRefKind(oldText), newTechnique: requireRefKind(newText) });
    });

  propose
    .command('attach-data <labId> <dataRef>')
    .description('attachData(labId, dataRef)')
    .action(async (labId: string, dataRefText: string) => {
      const dataRef = requireRefOfKind(dataRefText, 'data', 'a data');
      await submitProposal({ kind: 'attachData', labId, dataRef });
    });

  propose
    .command('promote-lab <labId> <status>')
    .description('promoteLab(labId, status)')
    .action(async (labId: string, status: string) => {
      await submitProposal({ kind: 'promoteLab', labId, status });
    });

  propose
    .command('migrate-action <actionRef>')
    .description('migrateAction(actionRef) — rewrites a .action file (execution/1) from YAML to JSON, content unchanged; a no-op if already JSON')
    .action(async (actionRefText: string) => {
      const actionRef = requireRefOfKind(actionRefText, 'action', 'an action');
      await submitProposal({ kind: 'migrateAction', actionRef });
    });

  propose
    .command('create-agent <labId> <name> <description>')
    .description("createAgent(labId, name, description) -- new declarations/agents/<name>.agent (agent/1); never authors the wrapped implementation itself")
    .option('--goal <text>', 'goal.description -- what the run must confirm/read, never generate', '')
    .option('--context-file <list>', 'comma-separated context.files, relative to the input root', '')
    .option('--capabilities <list>', 'comma-separated capabilities, default "file.read"', 'file.read')
    .action(async (labId: string, name: string, description: string, opts: { goal: string; contextFile: string; capabilities: string }) => {
      const contextFiles = parseList(opts.contextFile);
      const capabilities = parseList(opts.capabilities);
      await submitProposal({ kind: 'createAgent', labId, name, description, goal: opts.goal, contextFiles, capabilities });
    });

  program
    .command('diff <proposalId>')
    .description('ANALYSIS: render a stored Proposal\'s diff')
    .action(async (proposalId: string) => {
      const proposal = await getProposalStore(program).load(proposalId);
      console.log(formatDiff(proposal.diff));
    });

  program
    .command('apply <proposalId>')
    .description('MUTATIONS: persist a Proposal into labs/** (doc §8.2)')
    .action(async (proposalId: string) => {
      const store = getProposalStore(program);
      const proposal = await store.load(proposalId);
      const repo = getRepository(program);
      const touched = await repo.applyMutation(proposal.operation);
      await store.remove(proposalId);
      console.log(`applied ${proposalId} -- ${touched.join(', ')} updated, projection re-derived`);
    });
}
