import { readFile } from 'node:fs/promises';
import type { Command } from 'commander';
import { buildExperience } from '../../learn/experience.js';
import type { GplanDocument } from '../../resolve/resolveGflow.js';
import { fail, getExperienceStore, getRepository } from '../context.js';

/** `learn` group -- FEEDBACK (v1, resolve-time only): records what `resolve` matched/failed to match. */
export function registerLearnCommands(program: Command): void {
  const learn = program
    .command('learn')
    .description(
      'FEEDBACK (v1, resolve-time only): records what `resolve` matched/failed to match, for later trend-reading -- ' +
        'no repair loop, no lesson generalization, no regression suite yet. See docs/plans/worldctl-feedback-loop.md.',
    );

  learn
    .command('record <gplanPath>')
    .description(
      'Reads a `.gplan.json` (`ksworld resolve`\'s output) and writes ONE Experience -- matched/unmatched ' +
        'requirement counts, unmatched requirements re-diagnosed via `diagnose <capability>`, asset resolution -- ' +
        'to --state-dir/experiences/. Read-only against labs/**, never builds, never repairs.',
    )
    .option('--json', 'print exactly the written Experience as JSON, nothing else', false)
    .action(async (gplanPath: string, opts: { json: boolean }) => {
      let gplan: GplanDocument;
      try {
        gplan = JSON.parse(await readFile(gplanPath, 'utf-8'));
      } catch (err) {
        fail(`cannot read/parse ${gplanPath}: ${(err as Error).message}`);
      }
      const experience = await buildExperience(getRepository(program), gplanPath, gplan!);
      await getExperienceStore(program).save(experience);
      console.log(
        opts.json
          ? JSON.stringify(experience, null, 2)
          : `recorded ${experience.id} -- ${experience.summary.matchedCount} matched, ${experience.summary.unmatchedCount} unmatched requirement(s)`,
      );
    });

  learn
    .command('list')
    .description('every recorded Experience, oldest first')
    .option('--json', 'print exactly the Experience array as JSON, nothing else', false)
    .action(async (opts: { json: boolean }) => {
      const experiences = await getExperienceStore(program).list();
      if (opts.json) {
        console.log(JSON.stringify(experiences, null, 2));
        return;
      }
      if (experiences.length === 0) {
        console.log('(no experiences recorded yet -- see `ksworld learn record <gplan.json>`)');
        return;
      }
      for (const e of experiences) {
        console.log(`${e.id}  ${e.gameId}  matched=${e.summary.matchedCount} unmatched=${e.summary.unmatchedCount}  ${e.recordedAt}`);
      }
    });

  learn
    .command('show <id>')
    .description('one recorded Experience, in full, as JSON')
    .action(async (id: string) => {
      const experience = await getExperienceStore(program).load(id);
      console.log(JSON.stringify(experience, null, 2));
    });
}
