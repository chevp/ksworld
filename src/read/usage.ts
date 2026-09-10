import type { ClaudeUsageRecord } from '../model/usage.js';
import { usageLogPath } from '../persistence/usage-log.js';
import { readFile } from '../util/traced-fs.js';

export interface ModelUsageTotals {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
  costUsd: number;
}

export interface UsageSummary {
  /** Keyed by model name (`ClaudeUsageRecord.model`, or "unknown" when the `result` event carried
   *  no model) -- a plain object, not a `Map`: `WorldStatus` (this summary's only container) goes
   *  straight through `JSON.stringify` in `server/http-server.ts`'s `/status` route, where a `Map`
   *  would silently serialize as `{}`. */
  byModel: Record<string, ModelUsageTotals>;
  totalCostUsd: number;
}

function emptyTotals(): ModelUsageTotals {
  return { calls: 0, inputTokens: 0, outputTokens: 0, cacheCreationInputTokens: 0, cacheReadInputTokens: 0, costUsd: 0 };
}

/**
 * Reads and sums `<root>/.worldctl/usage.jsonl` (see persistence/usage-log.ts) -- only real
 * `claude -p` completions (`agent.runner === 'claude'`) ever append to it, so a world made
 * entirely of `nexo` Agents legitimately has an empty summary, not a broken one.
 */
export async function readUsageSummary(root: string): Promise<UsageSummary> {
  const byModel: Record<string, ModelUsageTotals> = {};
  let totalCostUsd = 0;

  let text: string;
  try {
    text = await readFile(usageLogPath(root), 'utf-8');
  } catch {
    return { byModel, totalCostUsd };
  }

  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    let record: ClaudeUsageRecord;
    try {
      record = JSON.parse(line) as ClaudeUsageRecord;
    } catch {
      continue;
    }
    const key = record.model ?? 'unknown';
    const totals = byModel[key] ?? emptyTotals();
    totals.calls += 1;
    totals.inputTokens += record.inputTokens ?? 0;
    totals.outputTokens += record.outputTokens ?? 0;
    totals.cacheCreationInputTokens += record.cacheCreationInputTokens ?? 0;
    totals.cacheReadInputTokens += record.cacheReadInputTokens ?? 0;
    totals.costUsd += record.costUsd ?? 0;
    byModel[key] = totals;
    totalCostUsd += record.costUsd ?? 0;
  }

  return { byModel, totalCostUsd };
}
