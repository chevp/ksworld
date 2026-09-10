import { readFile } from '../../util/traced-fs.js';
import { parse } from 'smol-toml';
import { parse as parseYaml } from 'yaml';
import { extname } from 'node:path';

export interface OperationRegistryEntry {
  name: string;
  runtime?: string;
  args?: string;
  summary?: string;
}

export interface OperationRegistry {
  kind?: string;
  operation?: OperationRegistryEntry[];
}

/**
 * Format chosen by the file's own extension, never assumed — mirrors
 * eon.exe's own registry reader (frostlib::OperationRegistry, via
 * frostlib::asTomlText's format sniff), which already accepts
 * `registry.{yaml,yml,json,toml}` for this exact document. `.json` needs no
 * separate parser: it is valid YAML 1.2, and the `yaml` package already
 * handles it, but `JSON.parse` is used directly for `.json` so a malformed
 * file gets a JSON error instead of a YAML one pointing at the wrong syntax.
 */
export async function parseOperationRegistry(path: string): Promise<OperationRegistry> {
  const text = await readFile(path, 'utf-8');
  const ext = extname(path).toLowerCase();
  if (ext === '.json') return JSON.parse(text) as OperationRegistry;
  if (ext === '.yaml' || ext === '.yml') return parseYaml(text) as OperationRegistry;
  return parse(text) as OperationRegistry;
}

/** Generic TOML load — used as a fallback for `.eon` files written in TOML instead of YAML syntax. */
export async function parseTomlFile(path: string): Promise<unknown> {
  const text = await readFile(path, 'utf-8');
  return parse(text);
}
