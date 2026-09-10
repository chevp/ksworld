import path from 'node:path';
import { readdir } from '../util/traced-fs.js';

/**
 * Directory basenames worldctl never descends into: VCS/build/cache
 * churn (`.git`, `node_modules`, `dist`, `build`, `.kosmos`) and heavy
 * binary content trees a Lab may hold (`blend`, `blender`, `gltf`,
 * `frost`, `textures`, `check`) that carry no Ref-relevant files.
 */
const SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  '.kosmos',
  'blend',
  'blender',
  'gltf',
  'frost',
  'textures',
  'check',
  '__pycache__',
]);

export interface WalkEntry {
  path: string;
  name: string;
  isDirectory: boolean;
}

/** Recursively lists files (and the directories skipped) under `root`, honoring SKIP_DIRS. */
export async function* walk(root: string): AsyncGenerator<WalkEntry> {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      yield { path: full, name: entry.name, isDirectory: true };
      yield* walk(full);
    } else {
      yield { path: full, name: entry.name, isDirectory: false };
    }
  }
}

/** Non-recursive: entries directly inside `dir`. */
export async function listDir(dir: string): Promise<WalkEntry[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.map((entry) => ({
    path: path.join(dir, entry.name),
    name: entry.name,
    isDirectory: entry.isDirectory(),
  }));
}
