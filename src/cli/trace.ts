import { createColors } from 'picocolors';

const pc = createColors(process.stderr.isTTY === true);

let enabled = false;

/** Turned on by `--verbose` (worldctl.ts) before any command action runs. */
export function enableTrace(): void {
  enabled = true;
}

/** One compact line per filesystem/process call worldctl makes, to stderr, gated behind --verbose. */
export function trace(line: string): void {
  if (enabled) console.error(pc.dim(`· ${line}`));
}
