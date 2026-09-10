import path from 'node:path';
import { readFile } from '../util/traced-fs.js';
import { listDir } from '../persistence/walk.js';

export interface QuickstartEntry {
  id: string;
  dir: string;
  name: string;
  summary?: string;
  hasIndexHtml: boolean;
  hasRuntimeServer: boolean;
  runtimePort?: number;
}

/** Hand-maintained: no manifest declares a Quickstart's own port today (see
    each Lab's README "Start"/"Endpunkte" section) -- kept here, next to the
    one place that renders it, rather than invented as a new sidecar file. */
const RUNTIME_PORTS: Record<string, number> = {
  'content-checker-lab': 8788,
  'content-txt2img-lab': 8787,
  'content-hunyuan3d-lab': 8789,
  'content-ollama-lab': 8790,
  'content-gen3d-lab': 8792,
};

async function readReadmeTitleAndSummary(readmePath: string): Promise<{ title?: string; summary?: string }> {
  try {
    const text = await readFile(readmePath, 'utf-8');
    const lines = text.split(/\r?\n/).map((line) => line.trim());
    const headingIdx = lines.findIndex((line) => line.startsWith('#'));
    const title = headingIdx >= 0 ? lines[headingIdx].replace(/^#+\s*/, '') : undefined;
    for (let i = headingIdx + 1; i < lines.length; i++) {
      if (lines[i].length > 0) return { title, summary: lines[i] };
    }
    return { title };
  } catch {
    return {};
  }
}

/** Immediate subdirectories of `root` only -- unlike `persistence/index.ts`'s
    `findLabs`, this does not recurse and does not skip `.kosmos` (a
    Quickstart's own `.kosmos/agents|agentic` is exactly what makes it
    interesting here, not something to hide). */
export async function scanQuickstarts(root: string): Promise<QuickstartEntry[]> {
  const entries = await listDir(root);
  const result: QuickstartEntry[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory) continue;
    const dir = entry.path;
    const inner = await listDir(dir);
    const names = new Set(inner.map((e) => e.name));
    const { title, summary } = names.has('README.md') ? await readReadmeTitleAndSummary(path.join(dir, 'README.md')) : {};
    result.push({
      id: entry.name,
      dir,
      name: title ?? entry.name,
      summary,
      hasIndexHtml: names.has('index.html'),
      hasRuntimeServer: names.has('runtime') || names.has('server.ts'),
      runtimePort: RUNTIME_PORTS[entry.name],
    });
  }
  result.sort((a, b) => a.id.localeCompare(b.id));
  return result;
}
