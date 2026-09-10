import type { Command } from 'commander';
import { findLayouts, listLayouts } from '../../read/layout.js';
import { formatLayoutInspect, formatLayoutList } from '../format.js';
import { fail, getRepository, requireRefKind } from '../context.js';

/** `layout` group -- read-only `.glayout.json` file index. */
export function registerLayoutCommands(program: Command): void {
  const layout = program
    .command('layout')
    .description(
      'QUERIES, read-only: `.glayout.json` files indexed under a Lab (docs/plans/glayout-json-format.md) -- the ' +
        'semantic graph between a .gflow intent and its node implementations. worldctl only finds/describes these ' +
        'files, it never interprets graph.nodes/graph.edges beyond a count, and never writes one.',
    );

  layout
    .command('list')
    .description('every Layout, optionally scoped to one Lab')
    .option('--lab <id>', 'restrict to this Lab id')
    .action(async (opts: { lab?: string }) => {
      const projection = await getRepository(program).load();
      console.log(formatLayoutList(listLayouts(projection, opts.lab)));
    });

  layout
    .command('find <query>')
    .description('Layouts whose id/name contains <query>')
    .action(async (query: string) => {
      const projection = await getRepository(program).load();
      console.log(formatLayoutList(findLayouts(projection, query)));
    });

  layout
    .command('inspect <ref>')
    .description('one Layout: name, node/edge counts, file path')
    .action(async (refText: string) => {
      const ref = requireRefKind(refText);
      if (ref.kind !== 'layout') fail(`expected a layout ref, got "${refText}"`);
      const projection = await getRepository(program).load();
      const found = projection.layouts.get(`${ref.kind}.${ref.id}`);
      if (!found) fail(`not found: ${refText}`);
      console.log(formatLayoutInspect(found));
    });

  // `.glayout.json`/`.gworld` graph validation/query/materialization moved to the standalone `gworld` CLI
  // (tools/gworld, 2026-09-08 extraction — see docs/plans/structured-rolling-catmull.md). worldctl no longer
  // knows about .glayout at all; only `gworld compile`'s gflow.requirements-filling role (see commands/gworld.ts)
  // still reuses gworld's validate/types as a library, since that role is gflow/gamedna domain logic, not .glayout logic.
}
