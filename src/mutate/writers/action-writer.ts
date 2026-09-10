import { readFile, writeFile } from 'node:fs/promises';
import { parse as parseYaml } from 'yaml';

/**
 * Rewrites a `.action` file's own serialization from YAML to JSON — content
 * unchanged, key order as YAML gave it (doc mapping note: `execution/1` is
 * migrating from `.afrost`/YAML to JSON). A no-op, not an error, when the
 * file already parses as JSON.
 */
export async function migrateActionToJson(filePath: string): Promise<boolean> {
  const text = await readFile(filePath, 'utf-8');
  try {
    JSON.parse(text);
    return false;
  } catch {
    // not JSON — fall through to the YAML->JSON rewrite
  }
  const doc = parseYaml(text);
  await writeFile(filePath, JSON.stringify(doc, null, 2) + '\n', 'utf-8');
  return true;
}
