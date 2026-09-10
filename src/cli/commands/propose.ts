import type { Command } from 'commander';
import type { MutationOperation } from '../../mutate/operations.js';
import { computeDiff } from '../../validate/diff.js';
import { formatDiff, formatProposal } from '../format.js';
import { fail, getProposalStore, getRepository, parseList, requireRefKind, requireRefOfKind, requireRelation } from '../context.js';

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
    .command('create-order <labId> <id>')
    .description('createOrder(labId, id) — new declarations/requests/<id>.drakar.json')
    .option('--requires <list>', 'comma-separated capability ids', '')
    .action(async (labId: string, id: string, opts: { requires: string }) => {
      await submitProposal({ kind: 'createOrder', labId, id, requires: parseList(opts.requires) });
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
    .command('change-route <orderKind> <workflowRef>')
    .description('changeRoute(orderKind, workflowRef)')
    .action(async (orderKind: string, workflowRefText: string) => {
      const workflowRef = requireRefOfKind(workflowRefText, 'workflow', 'a workflow');
      await submitProposal({ kind: 'changeRoute', orderKind, workflowRef });
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
    .command('create-capability <labId> <id> <description>')
    .description('createCapability(labId, id, description) -- new declarations/capabilities/<slug>.drakar.json, wrapping an already-real Technique/Agent so it becomes requires[]-reachable')
    .option('--source-type <type>', 'source.type, e.g. "registry", "agent" -- only "agent" resolves a providedBy edge', '')
    .option('--source-path <path>', 'source.path -- absolute or relative to the new .drakar.json', '')
    .action(async (labId: string, id: string, description: string, opts: { sourceType: string; sourcePath: string }) => {
      const source = opts.sourceType && opts.sourcePath ? { type: opts.sourceType, path: opts.sourcePath } : undefined;
      await submitProposal({ kind: 'createCapability', labId, id, description, source });
    });

  propose
    .command('create-agent <labId> <name> <description>')
    .description(
      "createAgent(labId, name, description) -- default --runner nexo: new declarations/agents/<name>.agent (agent/1), the reachable provider a capability's source.path can point at, never authors the wrapped implementation itself. --runner claude: new declarations/agents/<name>.drakar.json whose chat/run/build/run-capability target spawns `claude -p` instead of `nexo.exe run` (cli/claude-runner.ts); omitting --prompt-file falls back to worldctl's own built-in default prompt (prompts/promptLoader.ts)",
    )
    .option('--runner <nexo|claude>', 'which process executes this Agent', 'nexo')
    .option('--prompt-file <path>', '--runner claude only: Core system-prompt file, relative to the new document -- omit to use the built-in default', '')
    .option('--policy-file <list>', '--runner claude + --prompt-file only: comma-separated ordered policy files, relative to the new document, always loaded alongside --prompt-file', '')
    .option('--goal <text>', '--runner nexo only: goal.description -- what the run must confirm/read, never generate', '')
    .option('--context-file <list>', '--runner nexo only: comma-separated context.files, relative to the input root', '')
    .option('--capabilities <list>', 'comma-separated capabilities, default "file.read"', 'file.read')
    .action(
      async (
        labId: string,
        name: string,
        description: string,
        opts: { runner: string; promptFile: string; policyFile: string; goal: string; contextFile: string; capabilities: string },
      ) => {
        if (opts.runner !== 'nexo' && opts.runner !== 'claude') fail(`--runner must be "nexo" or "claude", got "${opts.runner}"`);
        if (opts.runner === 'nexo' && opts.policyFile) fail('--policy-file requires --runner claude');
        if (opts.policyFile && !opts.promptFile) fail('--policy-file requires --prompt-file');
        const contextFiles = parseList(opts.contextFile);
        const policyFiles = parseList(opts.policyFile);
        const capabilities = parseList(opts.capabilities);
        await submitProposal({
          kind: 'createAgent',
          labId,
          name,
          description,
          goal: opts.goal,
          contextFiles,
          capabilities,
          runner: opts.runner as 'nexo' | 'claude',
          promptFile: opts.promptFile || undefined,
          policyFiles: policyFiles.length > 0 ? policyFiles : undefined,
        });
      },
    );

  propose
    .command('update-capability-source <techniqueRef>')
    .description("updateCapabilitySource(techniqueRef, source) -- patches an existing capability-sourced Technique's .drakar.json source field in place")
    .requiredOption('--source-type <type>', 'source.type, e.g. "agent" -- only "agent" resolves a providedBy edge')
    .requiredOption('--source-path <path>', 'source.path -- absolute or relative to the .drakar.json')
    .action(async (techniqueRefText: string, opts: { sourceType: string; sourcePath: string }) => {
      const techniqueRef = requireRefOfKind(techniqueRefText, 'technique', 'a technique');
      await submitProposal({ kind: 'updateCapabilitySource', techniqueRef, source: { type: opts.sourceType, path: opts.sourcePath } });
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
