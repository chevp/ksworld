import { mkdir, appendFile } from 'node:fs/promises';
import path from 'node:path';
import type { ClaudeUsageRecord } from '../model/usage.js';

/** `<root>/.worldctl/usage.jsonl` -- one line per real `claude -p` completion (see claude-runner.ts). */
export function usageLogPath(root: string): string {
  return path.join(root, '.worldctl', 'usage.jsonl');
}

export async function appendUsageRecord(root: string, record: ClaudeUsageRecord): Promise<void> {
  const filePath = usageLogPath(root);
  await mkdir(path.dirname(filePath), { recursive: true });
  await appendFile(filePath, `${JSON.stringify(record)}\n`, 'utf-8');
}
