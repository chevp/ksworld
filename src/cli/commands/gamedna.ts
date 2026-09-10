import { readFile, writeFile } from 'node:fs/promises';
import type { Command } from 'commander';
import { compileRequirements } from '../../gamedna/compileRequirements.js';
import { fail } from '../context.js';

/** `gamedna` group -- content-gamedna-lab's deterministic `.gflow` rule set (no LLM), native worldctl JS. */
export function registerGamednaCommands(program: Command): void {
  const gamedna = program
    .command('gamedna')
    .description(
      'content-gamedna-lab\'s deterministic `.gflow` rule set (no LLM), native worldctl JS -- was ' +
        'runtime/scripts/compile-requirements.mjs, shelled out per-lab; now one in-process implementation ' +
        '(src/gamedna/compileRequirements.ts), also used as `gworld compile`\'s default engine.',
    );

  gamedna
    .command('compile-requirements <path>')
    .description(
      'Reads one standalone `.gflow` file (or a `.gworld` with its `gflow` unwrapped automatically, same ' +
        'schema-field detection as `glayout`/`gworld` commands), derives `requirements[]`, and writes it back ' +
        'into the SAME file/field -- no second `<gflow>.requirements.json`.',
    )
    .option('--json', 'print exactly {requirementsCount, requirements} as JSON, nothing else', false)
    .action(async (filePath: string, opts: { json: boolean }) => {
      let raw: Record<string, unknown>;
      try {
        raw = JSON.parse(await readFile(filePath, 'utf-8'));
      } catch (err) {
        fail(`cannot read/parse ${filePath}: ${(err as Error).message}`);
      }
      const isGworld = raw!.schema === 'gworld.schema.json';
      const fgame = (isGworld ? raw!.gflow : raw!) as Record<string, unknown>;
      const requirements = compileRequirements(fgame);
      fgame.requirements = requirements;
      await writeFile(filePath, JSON.stringify(raw!, null, 2) + '\n', 'utf-8');
      console.log(
        opts.json
          ? JSON.stringify({ requirementsCount: requirements.length, requirements }, null, 2)
          : `${requirements.length} requirement(s) merged into ${filePath}`,
      );
    });
}
