import type { Command } from 'commander';
import { status } from '../../read/status.js';
import { validateWorld } from '../../validate/validate.js';
import { detectCwdLab } from '../cwd-scope.js';
import { formatIssues, formatStatus } from '../format.js';
import { getProposalStore, getRepository, requireRefKind } from '../context.js';

/** `status`, `validate` -- world overview and reference-only validation (no native eon.exe/nexo.exe checks, see README.md). */
export function registerStatusCommands(program: Command): void {
  program
    .command('status')
    .description('OVERVIEW: root reachability, object counts, validation summary, pending proposals — scoped to the enclosing Lab when run from inside one')
    .option('--all', 'report the whole world, ignoring which Lab the current directory is inside')
    .action(async (opts: { all?: boolean }) => {
      const projection = await getRepository(program).load();
      const ref = opts.all ? undefined : detectCwdLab(projection, process.cwd());
      const result = await status(projection, ref);
      const proposals = await getProposalStore(program).list();
      console.log(formatStatus(result, proposals.length));
      if (result.errors > 0) process.exitCode = 1;
    });

  program
    .command('validate [ref]')
    .description(
      'ANALYSIS: unresolved references, missing providers (no LLM, no tokens, no native eon.exe/nexo.exe checks) — scoped to one ref, the enclosing Lab when run from inside one, or the whole world with --all',
    )
    .option('--all', 'validate the whole world, ignoring which Lab the current directory is inside')
    .action(async (refText: string | undefined, opts: { all?: boolean }) => {
      const projection = await getRepository(program).load();
      const ref = refText ? requireRefKind(refText) : opts.all ? undefined : detectCwdLab(projection, process.cwd());
      const issues = await validateWorld(projection, ref);
      console.log(formatIssues(issues));
      if (issues.some((issue) => issue.severity === 'error')) process.exitCode = 1;
    });
}
