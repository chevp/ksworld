import { readFile } from '../../util/traced-fs.js';

export type DrakarKind = 'capability' | 'workflow' | 'agent' | 'request' | 'population';

export interface DrakarDocument {
  kind: string;
  version?: number;
  id: string;
  description?: string;
  provides?: string[];
  requires?: string[];
  source?: { type?: string; path?: string };
  /** `kind:"agent"` only — `"claude"` runs this Agent via `claude -p` instead of `nexo.exe run`. Default `"nexo"`. */
  runner?: string;
  /** `kind:"agent"` + `runner:"claude"` only — Core system-prompt file, relative to this document. Omit to use worldctl's own built-in default (prompts/promptLoader.ts's `DEFAULT_CORE`). */
  promptFile?: string;
  /** `kind:"agent"` + `runner:"claude"` + `promptFile` only — ordered policy files, relative to this document, always loaded alongside `promptFile` (see prompts/promptLoader.ts). */
  policyFiles?: string[];
}

export async function parseDrakarDocument(path: string): Promise<DrakarDocument> {
  const text = await readFile(path, 'utf-8');
  return JSON.parse(text) as DrakarDocument;
}

export function isKnownDrakarKind(kind: string): kind is DrakarKind {
  return kind === 'capability' || kind === 'workflow' || kind === 'agent' || kind === 'request' || kind === 'population';
}
