import { readFile, writeFile } from 'node:fs/promises';
import { parseDocument } from 'yaml';

/**
 * Patches a `.eon` YAML pipeline in place via the `yaml` package's
 * CST-preserving `Document` API — comments and formatting survive the edit,
 * unlike a re-serialize-from-scratch `yaml.parse`/`yaml.stringify` round trip.
 */
export async function patchEonYaml(filePath: string, dotPath: string, value: unknown): Promise<void> {
  const text = await readFile(filePath, 'utf-8');
  const doc = parseDocument(text);
  const segments = dotPath.split('.');
  doc.setIn(segments, value);
  await writeFile(filePath, doc.toString(), 'utf-8');
}

/** Replaces `--step <oldName>` with `--step <newName>` across every job step's `run` string. */
export async function replaceEonStepReference(filePath: string, oldName: string, newName: string): Promise<boolean> {
  const text = await readFile(filePath, 'utf-8');
  const pattern = new RegExp(`--step\\s+${oldName}\\b`, 'g');
  if (!pattern.test(text)) return false;
  const replaced = text.replace(pattern, `--step ${newName}`);
  await writeFile(filePath, replaced, 'utf-8');
  return true;
}
