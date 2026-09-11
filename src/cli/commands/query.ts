import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import type { Command } from 'commander';
import { isRefKind } from '../../model/refs.js';
import { explain } from '../../read/explain.js';
import { inspect } from '../../read/inspect.js';
import { search } from '../../read/search.js';
import { diagnoseCapability, type RequirementContext } from '../../resolve/diagnose.js';
import { formatDiagnosis, formatInspect, formatSearchHits } from '../format.js';
import { fail, getRepository, requireRefKind } from '../context.js';

/** `inspect`, `search`, `diagnose` -- the root-level QUERIES/DIAGNOSIS commands. */
export function registerQueryCommands(program: Command): void {
  program
    .command('inspect <ref>')
    .description('QUERIES: full object + resolved edges for one ref (doc §8.1)')
    .option('--json', 'print exactly {ref, object, edgesFrom, edgesTo} as JSON, nothing else -- e.g. gworldui resolving an ExecutionPlan target Ref to its Agent/Workflow file path', false)
    .action(async (refText: string, opts: { json: boolean }) => {
      const ref = requireRefKind(refText);
      const projection = await getRepository(program).load();
      const result = inspect(projection, ref);
      if (opts.json) { console.log(JSON.stringify(result, null, 2)); return; }
      const explainLines = await explain(projection, ref);
      console.log(formatInspect(result, explainLines));
    });

  program
    .command('search <kind> <term>')
    .description('QUERIES: refs of <kind> whose id/name/summary contains <term>')
    .action(async (kind: string, term: string) => {
      if (!isRefKind(kind)) fail(`unknown kind "${kind}"`);
      const projection = await getRepository(program).load();
      console.log(formatSearchHits(search(projection, kind, term)));
    });

  program
    .command('diagnose <capability>')
    .description(
      'DIAGNOSIS: why a requirement\'s capability id has no requires-reachable Technique -- ' +
        'missing/existing-but-misclassified/existing-but-unregistered/protocol-gap, ' +
        'plus (only for a true miss) a compact Implementation Specification a coding agent can act on without ' +
        'reading this analysis. Deterministic, no LLM call, writes nothing but --out-dir\'s own JSON file.',
    )
    .option('--requirement-id <id>', 'pass-through REQ-... id from the caller\'s compiled .gflow, echoed verbatim')
    .option('--requirement-name <name>', 'pass-through human label, echoed verbatim')
    .option('--source-key <key>', 'pass-through .gflow field path that produced this requirement, e.g. "items.equipment"')
    .option('--feature <list>', 'comma-separated pass-through features[]', '')
    .option('--dependency <list>', 'comma-separated pass-through dependency requirement ids', '')
    .option('--output <list>', 'comma-separated pass-through expected output file names', '')
    .option('--quantity <n>', 'pass-through quantity')
    .option('--json', 'print exactly the diagnosis object as JSON, nothing else', false)
    .option('--out-dir <dir>', 'also write the diagnosis JSON to <dir>/<requirement-id-or-capability>.json')
    .action(
      async (
        capability: string,
        opts: {
          requirementId?: string;
          requirementName?: string;
          sourceKey?: string;
          feature: string;
          dependency: string;
          output: string;
          quantity?: string;
          json: boolean;
          outDir?: string;
        },
      ) => {
        const splitCsv = (list: string) => list.split(',').map((s) => s.trim()).filter(Boolean);
        const context: RequirementContext = {
          id: opts.requirementId,
          name: opts.requirementName,
          sourceKey: opts.sourceKey,
          quantity: opts.quantity !== undefined ? Number(opts.quantity) : undefined,
          features: splitCsv(opts.feature),
          dependencies: splitCsv(opts.dependency),
          outputs: splitCsv(opts.output),
        };
        const projection = await getRepository(program).load();
        const diagnosis = diagnoseCapability(projection, capability, context);

        if (opts.outDir) {
          const filename = (opts.requirementId ?? capability).replace(/[^a-zA-Z0-9_.-]/g, '_') + '.json';
          await mkdir(opts.outDir, { recursive: true });
          await writeFile(path.join(opts.outDir, filename), JSON.stringify(diagnosis, null, 2) + '\n', 'utf-8');
        }

        console.log(opts.json ? JSON.stringify(diagnosis, null, 2) : formatDiagnosis(diagnosis));
        process.exitCode = 1;
      },
    );
}
