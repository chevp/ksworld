import path from 'node:path';
import type { Command } from 'commander';
import { createColors } from 'picocolors';
import { DEPENDENCY_RELATIONS, type DependencyRelation } from '../graph/dependency.js';
import { parseRef, type AnyRef, type Ref, type RefKind } from '../model/refs.js';
import { WorldRepository } from '../persistence/repository.js';
import { ProposalStore } from './proposals.js';
import { ExperienceStore } from './experiences.js';
import { FileSystemWorkspace } from '../workspace/FileSystemWorkspace.js';

/**
 * Shared state/helpers for `src/cli/commands/*.ts` -- ported from worldctl's own `cli/context.ts`
 * (tools/worldctl), trimmed to what ksworld's web-safe command surface actually needs: no
 * `chat`/`new` synthetic Agents (those spawn `claude`/`nexo.exe`, see README.md's boundary), no
 * pipe25d/game-lab-scaffold roots.
 */

/** No network-share default here (worldctl's own `DEFAULT_ROOT` points at a private UNC path) --
 *  a GitHub Actions runner has no such share; callers pass `--root` (the action's own `root`
 *  input) or set `KSWORLD_LABS_ROOT`. */
export const DEFAULT_ROOT = process.env.KSWORLD_LABS_ROOT ?? process.cwd();

/**
 * The common schema library `nodes/<type>.schema.json` files `$ref` by
 * absolute URL ($id-registered, e.g. Vector3Array) -- sitting next to
 * whichever `--nodes-dir` was passed, at `<nodes-dir>/../schemas/common/
 * *.schema.json`.
 */
export function commonSchemaPathsFor(nodesDir: string): string[] {
  const commonDir = path.resolve(nodesDir, '..', 'schemas', 'common');
  return [path.join(commonDir, 'vector.schema.json'), path.join(commonDir, 'transform.schema.json')];
}

/** See format.ts's note on picocolors' win32-always-on default — gated on a real TTY here too. */
export const pc = createColors(process.stdout.isTTY === true);

export function requireRefKind(text: string): AnyRef {
  return parseRef(text);
}

/** `requireRefKind` + a kind guard, collapsed to one call -- `label` carries the article ("a workflow", "an action"). */
export function requireRefOfKind<K extends RefKind>(text: string, kind: K, label: string): Ref<K> {
  const ref = requireRefKind(text);
  if (ref.kind !== kind) fail(`expected ${label} ref, got "${text}"`);
  return ref as Ref<K>;
}

/** Shared comma-separated-list parsing for `--requires`/`--context-file`/`--policy-file`/`--capabilities`. */
export function parseList(text: string): string[] {
  return text.split(',').map((s) => s.trim()).filter(Boolean);
}

export function requireRelation(text: string): DependencyRelation {
  if (!(DEPENDENCY_RELATIONS as readonly string[]).includes(text)) {
    throw new Error(`unknown relation "${text}" — expected one of ${DEPENDENCY_RELATIONS.join(', ')}`);
  }
  return text as DependencyRelation;
}

export function fail(message: string): never {
  console.error(pc.red(`ksworld: ${message}`));
  process.exit(1);
}

export function getRepository(program: Command): WorldRepository {
  return new WorldRepository(program.opts().root as string);
}

export function getProposalStore(program: Command): ProposalStore {
  return new ProposalStore(new FileSystemWorkspace(program.opts().stateDir as string));
}

export function getExperienceStore(program: Command): ExperienceStore {
  return new ExperienceStore(new FileSystemWorkspace(program.opts().stateDir as string));
}
