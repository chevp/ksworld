import { readFile } from '../../util/traced-fs.js';
import { Document, parse, parseDocument } from 'yaml';

const UNCLOSED_FLOW_SEQUENCE_START = /^(\s*)([\w.-]+):\s*\[\s*$/;

/**
 * Some real `.eon` files open a flow sequence (`key: [`) and continue its
 * items on following lines at the SAME indent as `key:` itself — invalid
 * per the YAML spec (flow content must be more indented than its block
 * context), rejected hard by the `yaml` package with no lenient-mode
 * escape hatch, but apparently tolerated by whatever parser `eon.exe` uses
 * (e.g. `content-labs/engine/checker-lab/workflows/level.eon`). A flow
 * sequence is valid YAML on one line regardless of indentation, so this
 * collapses each such block onto its opening line before parsing — applied
 * only as a fallback after a normal parse fails.
 */
function repairUnindentedFlowSequences(text: string): string {
  const lines = text.split(/\r?\n/);
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const openMatch = UNCLOSED_FLOW_SEQUENCE_START.exec(lines[i]);
    if (!openMatch) {
      out.push(lines[i]);
      continue;
    }
    const items: string[] = [];
    let j = i + 1;
    let closed = false;
    for (; j < lines.length; j++) {
      const trimmed = lines[j].trim();
      if (trimmed === ']' || trimmed.endsWith(']')) {
        const withoutBracket = trimmed.replace(/\]\s*$/, '').replace(/,\s*$/, '').trim();
        if (withoutBracket.length > 0) items.push(withoutBracket);
        closed = true;
        break;
      }
      const withoutComma = trimmed.replace(/,\s*$/, '');
      if (withoutComma.length > 0) items.push(withoutComma);
    }
    if (!closed) {
      out.push(lines[i]);
      continue;
    }
    const [, indent, key] = openMatch;
    out.push(`${indent}${key}: [${items.join(', ')}]`);
    i = j;
  }
  return out.join('\n');
}

export async function parseYamlFile(path: string): Promise<unknown> {
  const text = await readFile(path, 'utf-8');
  try {
    return parse(text);
  } catch (err) {
    try {
      return parse(repairUnindentedFlowSequences(text));
    } catch {
      throw err;
    }
  }
}

/** Loaded as a CST-preserving Document for round-trippable edits (mutate/writers/eon-writer.ts). */
export async function parseYamlDocument(path: string): Promise<Document> {
  const text = await readFile(path, 'utf-8');
  return parseDocument(text);
}
