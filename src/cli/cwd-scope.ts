import path from 'node:path';
import type { LabRef } from '../model/refs.js';
import type { WorldProjection } from '../persistence/index.js';

/**
 * Which Lab (if any) `cwd` sits inside, for `status`/`validate` to default their
 * scope to "the Lab I'm standing in" instead of always the whole `labs/**` tree.
 * Case-insensitive path compare — UNC shares and PowerShell PSDrive prefixes on
 * Windows don't reliably agree on case.
 */
export function detectCwdLab(projection: WorldProjection, cwd: string): LabRef | undefined {
  const normalize = (p: string) => path.resolve(p).replace(/\\/g, '/').toLowerCase();
  const normalizedCwd = normalize(cwd);
  for (const lab of projection.labs.values()) {
    const labDir = normalize(lab.dir);
    if (normalizedCwd === labDir || normalizedCwd.startsWith(`${labDir}/`)) return lab.ref;
  }
  return undefined;
}
