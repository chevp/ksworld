import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * worldctl-owned bookkeeping under `<lab>/.kosmos/worldctl/` — namespaced
 * inside the repo's existing per-Lab `.kosmos/` directory. Used for concepts
 * `eon.exe`/`nexo.exe` do not read (attached Data, Route, promotion status)
 * so a mutation never risks corrupting a file those tools parse strictly.
 */
export async function readSidecarJson<T>(labDir: string, fileName: string, fallback: T): Promise<T> {
  try {
    const text = await readFile(path.join(labDir, '.kosmos', 'worldctl', fileName), 'utf-8');
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

export async function writeSidecarJson(labDir: string, fileName: string, value: unknown): Promise<string> {
  const dir = path.join(labDir, '.kosmos', 'worldctl');
  await mkdir(dir, { recursive: true });
  const filePath = path.join(dir, fileName);
  await writeFile(filePath, JSON.stringify(value, null, 2) + '\n', 'utf-8');
  return filePath;
}
