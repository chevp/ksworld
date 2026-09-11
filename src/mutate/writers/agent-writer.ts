import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Patches an existing NEXO `.agent`/`.order.agent` JSON document. Reads,
 * mutates the parsed object, writes back pretty-printed — every other key
 * is preserved untouched.
 */
export async function patchAgentDocument(
  agentPath: string,
  mutate: (doc: Record<string, unknown>) => void,
): Promise<void> {
  const text = await readFile(agentPath, 'utf-8');
  const doc = JSON.parse(text) as Record<string, unknown>;
  mutate(doc);
  await writeFile(agentPath, JSON.stringify(doc, null, 2) + '\n', 'utf-8');
}

/**
 * Creates a new NEXO `agent/1` `.agent` document under
 * `<lab>/declarations/agents/` — a minimal, real (nexo.exe-validatable)
 * agent. It never authors a capability's actual implementation —
 * `goal`/`knowledge` must describe confirming/reading the already-real
 * file named by `contextFiles`, never generating or changing it. Additive:
 * never overwrites an existing file.
 */
export async function createAgentDocument(
  labDir: string,
  name: string,
  description: string,
  goal: string,
  contextFiles: string[],
  capabilities: string[],
): Promise<string> {
  const dir = path.join(labDir, 'declarations', 'agents');
  await mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `${name}.agent`);
  try {
    await readFile(filePath, 'utf-8');
    throw new Error(`refusing to overwrite existing ${filePath}`);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
  const doc: Record<string, unknown> = {
    kind: 'agent/1',
    version: '1',
    name,
    description,
    goal: { description: goal },
    input: { root: { type: 'directory', required: true, description: `${name}'s own directory.` } },
    ...(contextFiles.length > 0 ? { context: { files: contextFiles } } : {}),
    capabilities: capabilities.length > 0 ? capabilities : ['file.read'],
    output: { type: 'text' },
    limits: { max_iterations: 3, max_runtime: '2m', max_tokens: 4000 },
  };
  await writeFile(filePath, JSON.stringify(doc, null, 2) + '\n', 'utf-8');
  return filePath;
}
