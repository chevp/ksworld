#!/usr/bin/env node
import path from 'node:path';
import { Command } from 'commander';
import { enableTrace } from './trace.js';
import { VERSION } from './version.js';
import { DEFAULT_ROOT, pc } from './context.js';
import { registerQueryCommands } from './commands/query.js';
import { registerContentCommands } from './commands/content.js';
import { registerLayoutCommands } from './commands/layout.js';
import { registerGamednaCommands } from './commands/gamedna.js';
import { registerStatusCommands } from './commands/status.js';
import { registerProposeCommands } from './commands/propose.js';
import { registerExecutionCommands } from './commands/execution.js';
import { registerLearnCommands } from './commands/learn.js';

async function main(): Promise<void> {
  const program = new Command();
  program
    .name('ksworld')
    .description(
      "ksworld — worldctl's web-safe capabilities (query/content/layout/gamedna/status/propose/plan/resolve/learn), " +
        'for use in GitHub Actions. No native eon.exe/nexo.exe execution, no `claude`/`nexo.exe` spawning, no gworld/' +
        'pipe25d integration — see README.md for the exact boundary and why.',
    )
    .version(VERSION)
    .option('--root <path>', 'labs/** root', DEFAULT_ROOT)
    // Same default as worldctl's own `.kosmos/worldctl/` (tools/worldctl) -- both tools share the
    // same per-Lab sidecar/proposal-store convention on a labs/** checkout (mutate/writers/
    // sidecar-writer.ts), deliberately not forked into a separate `.kosmos/ksworld/`.
    .option('--state-dir <path>', 'local proposal store, outside labs/**', path.join('.kosmos', 'worldctl'))
    .option('-v, --verbose', 'log every filesystem read, one compact line each, to stderr', false)
    .hook('preAction', (thisCommand) => {
      if (thisCommand.opts().verbose) enableTrace();
    });

  registerQueryCommands(program);
  registerContentCommands(program);
  registerLayoutCommands(program);
  registerGamednaCommands(program);
  registerStatusCommands(program);
  registerProposeCommands(program);
  registerExecutionCommands(program);
  registerLearnCommands(program);

  await program.parseAsync(process.argv);
}

main().catch((err) => {
  console.error(pc.red(`ksworld: fatal: ${(err as Error).stack ?? err}`));
  process.exit(1);
});
