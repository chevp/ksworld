import type { Command } from 'commander';
import { analyzeContent, findContent, findContentUsages, listContent, planContentMigration, resolveArtifacts } from '../../read/content.js';
import { formatContentAnalysis, formatContentArtifacts, formatContentInspect, formatContentList, formatContentRefs, formatMigrationPlan } from '../format.js';
import { fail, getRepository, requireRefKind } from '../context.js';

/** `content` group -- materialized/catalogized Content objects (doc: catalog/assets/*.json). */
export function registerContentCommands(program: Command): void {
  const content = program
    .command('content')
    .description(
      'QUERIES: the materialized, catalogized objects a Lab has actually built (doc: catalog/assets/*.json, ' +
        'a cross-Lab convention this Ref kind indexes, not a new one) — list/inspect/find them by their own ' +
        'catalog id, without needing to know which of recipes/catalog/build/source/gltf a file lives under.',
    );

  content
    .command('list')
    .description('every Content object, optionally scoped to one Lab')
    .option('--lab <id>', 'restrict to this Lab id (e.g. content-labs/systems/env-asset-lab)')
    .action(async (opts: { lab?: string }) => {
      const projection = await getRepository(program).load();
      console.log(formatContentList(listContent(projection, opts.lab)));
    });

  content
    .command('find <query>')
    .description('Content whose id/category/role contains <query> — no file path needed')
    .action(async (query: string) => {
      const projection = await getRepository(program).load();
      console.log(formatContentList(findContent(projection, query)));
    });

  content
    .command('inspect <ref>')
    .description('one Content object in full: category/status/role, every real artifact file it owns, every levels/**/placements.json that references it')
    .action(async (refText: string) => {
      const ref = requireRefKind(refText);
      if (ref.kind !== 'content') fail(`expected a content ref, got "${refText}"`);
      const projection = await getRepository(program).load();
      const found = projection.content.get(`${ref.kind}.${ref.id}`);
      if (!found) fail(`not found: ${refText}`);
      const [artifacts, usages] = await Promise.all([resolveArtifacts(projection, found), findContentUsages(projection, found)]);
      console.log(formatContentInspect(found, artifacts, usages));
    });

  content
    .command('artifacts <ref>')
    .description('just the artifact files (recipe, built .frost, everything under build/<id>.*) — see `content inspect` for the full picture')
    .action(async (refText: string) => {
      const ref = requireRefKind(refText);
      if (ref.kind !== 'content') fail(`expected a content ref, got "${refText}"`);
      const projection = await getRepository(program).load();
      const found = projection.content.get(`${ref.kind}.${ref.id}`);
      if (!found) fail(`not found: ${refText}`);
      console.log(formatContentArtifacts(await resolveArtifacts(projection, found)));
    });

  content
    .command('refs <ref>')
    .description('every levels/**/placements.json that references this Content id')
    .action(async (refText: string) => {
      const ref = requireRefKind(refText);
      if (ref.kind !== 'content') fail(`expected a content ref, got "${refText}"`);
      const projection = await getRepository(program).load();
      const found = projection.content.get(`${ref.kind}.${ref.id}`);
      if (!found) fail(`not found: ${refText}`);
      console.log(formatContentRefs(found, await findContentUsages(projection, found)));
    });

  content
    .command('analyze')
    .description(
      'ANALYSIS, never writes: real counts against real files -- objects with/without a build manifest, missing ' +
        'recipe files, and the one real "duplicate representation" class found 2026-09-01 (source.builtFrost vs ' +
        'manifest.artifacts.frost independently naming the same file, already drifted).',
    )
    .option('--lab <id>', 'restrict to this Lab id')
    .action(async (opts: { lab?: string }) => {
      const projection = await getRepository(program).load();
      console.log(formatContentAnalysis(await analyzeContent(projection, opts.lab)));
    });

  content
    .command('migrate')
    .description('MIGRATION: currently `--plan` only (doc §5.2 lifecycle) -- prints CURRENT/TARGET/CHANGES/DELETE/REASON per object, writes nothing')
    .option('--plan', 'the only supported mode right now -- required, refuses without it rather than silently doing nothing')
    .option('--lab <id>', 'restrict to this Lab id')
    .action(async (opts: { plan?: boolean; lab?: string }) => {
      if (!opts.plan) fail('content migrate needs --plan -- no other mode is implemented yet, and this refuses rather than silently no-op');
      const projection = await getRepository(program).load();
      console.log(formatMigrationPlan(await planContentMigration(projection, opts.lab)));
    });
}
