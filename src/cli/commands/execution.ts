import { readFile, writeFile } from 'node:fs/promises';
import type { Command } from 'commander';
import { planOrder } from '../../resolve/plan.js';
import { resolveGflow, type GflowAssetGeneration, type GflowRequirement, type GflowSlice } from '../../resolve/resolveGflow.js';
import { formatPlan } from '../format.js';
import { fail, getRepository, requireRefKind } from '../context.js';

/**
 * `plan`, `resolve` -- RESOLUTION commands only. worldctl's own `build`/`run-capability`
 * (cli/build.ts: `eon.exe run`/`nexo.exe run`, stdio inherited) are deliberately not ported here
 * -- ksworld exposes only capabilities that need no native process on the runner. See README.md.
 */
export function registerExecutionCommands(program: Command): void {
  program
    .command('plan <orderRef>')
    .description('RESOLUTION: prints the resolver\'s ExecutionPlan, unmodified (doc §8.3) — never executes it')
    .action(async (orderRefText: string) => {
      const orderRef = requireRefKind(orderRefText);
      if (orderRef.kind !== 'order') fail(`expected an order ref, got "${orderRefText}"`);
      const projection = await getRepository(program).load();
      const plan = await planOrder(projection, orderRef);
      console.log(formatPlan(plan));
    });

  program
    .command('resolve <path>')
    .description(
      'RESOLUTION: reads a .gflow\'s (or a .gworld\'s embedded `gflow`, gworld.schema.json v2 -- detected by the ' +
        'document\'s own "schema" field, not the file extension, same convention as `glayout/load.ts`) already-' +
        'compiled `requirements[]` + `assets.generation[]`, matches every requirement (search+diagnose), creates/' +
        'reuses one Order per matched Lab (propose+apply, no confirmation -- only `build` ever asks), plans each ' +
        '(same ExecutionPlan `plan` computes), and resolves each asset-generation entry against the Content ' +
        'catalog (`content find`) -- writes the concrete result to --out as .gplan.json. Never builds -- see ' +
        '`build <orderRef>` for that, once per Order in the result.',
    )
    .option('--out <path>', '.gplan.json output path (default: <path> with its .gflow/.gworld extension replaced by .gplan.json)')
    .action(async (inputPath: string, opts: { out?: string }) => {
      let rawDoc: Record<string, unknown>;
      try {
        rawDoc = JSON.parse(await readFile(inputPath, 'utf-8'));
      } catch (err) {
        fail(`cannot read/parse ${inputPath}: ${(err as Error).message}`);
      }

      // A .gworld (gworld.schema.json v2) embeds the full .gflow document
      // under `gflow` -- unwrap it here so everything below stays the exact
      // same .gflow-shaped slice regardless of which container was opened.
      const gflowDoc = rawDoc.schema === 'gworld.schema.json' ? (rawDoc.gflow as Record<string, unknown> | undefined) : rawDoc;
      if (!gflowDoc) fail(`${inputPath}: gworld.schema.json document has no "gflow"`);

      const gameId = gflowDoc['game.id'];
      if (typeof gameId !== 'string' || !gameId) fail(`${inputPath} has no "game.id"`);

      const input: GflowSlice = {
        gflowPath: inputPath,
        gameId,
        requirements: Array.isArray(gflowDoc.requirements) ? (gflowDoc.requirements as GflowRequirement[]) : [],
        assetsGeneration: Array.isArray(gflowDoc['assets.generation']) ? (gflowDoc['assets.generation'] as GflowAssetGeneration[]) : [],
      };

      const gplan = await resolveGflow(getRepository(program), input);
      const outPath = opts.out ?? inputPath.replace(/\.(gflow|gworld)$/, '.gplan.json');
      await writeFile(outPath, JSON.stringify(gplan, null, 2));

      // The summary line alone hid exactly the thing a 0-plans/N-unmatched
      // run needs to explain itself for -- which requirement, which
      // capability, why. Both lists are already in the written .gplan.json;
      // echoing them here means the console log (what gworldui's RunService
      // pipes straight into its own output pane) carries the same
      // information without a second file open.
      for (const plan of gplan.plans) {
        console.log(`  plan   ${plan.order} -> ${plan.target.kind}:${plan.target.kind === 'nexo' ? plan.target.agent : plan.target.pipeline}`);
      }
      for (const u of gplan.unmatched) {
        console.log(`  unmatched  ${u.id} (${u.capability}): ${u.reason}`);
      }
      console.log(`resolved ${gplan.plans.length} plan(s), ${gplan.unmatched.length} unmatched, ${gplan.assets.length} asset(s) -> ${outPath}`);
    });
}
