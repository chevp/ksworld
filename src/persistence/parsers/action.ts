import { readFile } from '../../util/traced-fs.js';
import { parse as parseYaml } from 'yaml';

export interface ActionDocument {
  kind?: string;
  name?: string;
  uses?: string;
  with?: { run?: string };
  outputs?: Record<string, string>;
}

export interface ParsedAction {
  doc: ActionDocument;
  format: 'json' | 'yaml';
}

/**
 * `.action` files are migrating from YAML to JSON (doc mapping note:
 * `execution/1`, formerly `.afrost`) — JSON is tried first since that is the
 * target format, YAML is the fallback for files not yet migrated.
 */
export async function parseActionDocument(path: string): Promise<ParsedAction> {
  const text = await readFile(path, 'utf-8');
  try {
    return { doc: JSON.parse(text) as ActionDocument, format: 'json' };
  } catch {
    return { doc: parseYaml(text) as ActionDocument, format: 'yaml' };
  }
}
