import { readFile, writeFile } from 'node:fs/promises';
import type { Command } from 'commander';
import { resolveGflow, type GflowAssetGeneration, type GflowRequirement, type GflowSlice } from '../../resolve/resolveGflow.js';
import { fail, getRepository } from '../context.js';

/**
 * `resolve` -- RESOLUTION command only. worldctl's own `build`/`run-capability`
 * (cli/build.ts: `eon.exe run`/`nexo.exe run`, stdio inherited) are deliberately not ported here
 * -- ksworld exposes only capabilities that need no native process on the runner. See README.md.
 */
export function registerExecutionCommands(program: Command): void {
  program
    .command('resolve <path>')
    .description(
      'RESOLUTION: reads a .gflow\'s (or a .gworld\'s embedded `gflow`, gworld.schema.json v2 -- detected by the ' +
        'document\'s own "schema" field, not the file extension, same convention as `glayout/load.ts`) already-' +
        'compiled `requirements[]` + `assets.generation[]`, matches every requirement against an indexed Technique ' +
        '(search+diagnose, never writes), and resolves each asset-generation entry against the Content catalog ' +
        '(`content find`) -- writes the concrete result to --out as .gplan.json.',
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

      // The summary line alone hid exactly the thing a 0-matched/N-unmatched
      // run needs to explain itself for -- which requirement, which
      // capability, why. Both lists are already in the written .gplan.json;
      // echoing them here means the console log (what gworldui's RunService
      // pipes straight into its own output pane) carries the same
      // information without a second file open.
      for (const m of gplan.matched) {
        console.log(`  matched   ${m.id} (${m.capability}) -> ${m.technique}`);
      }
      for (const u of gplan.unmatched) {
        console.log(`  unmatched  ${u.id} (${u.capability}): ${u.reason}`);
      }
      console.log(`resolved ${gplan.matched.length} matched, ${gplan.unmatched.length} unmatched, ${gplan.assets.length} asset(s) -> ${outPath}`);
    });
}
