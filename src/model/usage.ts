/**
 * One real `claude -p` completion's token usage — parsed from its `--output-format
 * stream-json` `result` event (see cli/claude-runner.ts's `printEvent`). `nexo.exe run`/
 * `eon.exe run` are excluded by design: stdio is inherited (worldctl.ts's own "NOT part of
 * world-control's own [...]" note), so no usage data ever reaches this process for those.
 */
export interface ClaudeUsageRecord {
  timestamp: string;
  agent: string;
  model?: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
  costUsd?: number;
  ok: boolean;
}
