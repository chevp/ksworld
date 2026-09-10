import { readFile as rawReadFile, readdir as rawReaddir, stat as rawStat } from 'node:fs/promises';
import type { Dirent, Stats } from 'node:fs';
import { trace } from '../cli/trace.js';

/** Thin `node:fs/promises` wrappers that emit one `trace()` line per call — the single choke point every filesystem read goes through, so `--verbose` sees all of them without instrumenting each call site. */

export async function readFile(path: string, encoding: BufferEncoding): Promise<string> {
  trace(`read   ${path}`);
  return rawReadFile(path, encoding);
}

export async function readdir(path: string, options: { withFileTypes: true }): Promise<Dirent[]> {
  trace(`ls     ${path}`);
  return rawReaddir(path, options);
}

export async function stat(path: string): Promise<Stats> {
  trace(`stat   ${path}`);
  return rawStat(path);
}
