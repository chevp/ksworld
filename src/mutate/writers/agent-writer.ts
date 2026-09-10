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
 * Creates a new `*.drakar.json` with `"kind":"request"` under
 * `<lab>/declarations/requests/` — the real shape used by
 * `delta-drakar-lab/declarations/requests/*.drakar.json` (a classified,
 * concrete ask; doc's Order, see model/order.ts). Additive: never
 * overwrites an existing file.
 */
export async function createDrakarRequest(labDir: string, id: string, requires: string[]): Promise<string> {
  const dir = path.join(labDir, 'declarations', 'requests');
  await mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `${id}.drakar.json`);
  try {
    await readFile(filePath, 'utf-8');
    throw new Error(`refusing to overwrite existing ${filePath}`);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
  const doc = { kind: 'request', version: 1, id, requires };
  await writeFile(filePath, JSON.stringify(doc, null, 2) + '\n', 'utf-8');
  return filePath;
}

/**
 * Creates a new `*.drakar.json` with `"kind":"capability"` under
 * `<lab>/declarations/capabilities/` -- the real shape used by
 * `delta-drakar-lab/declarations/capabilities/scene-zone-compose.drakar.json`
 * (source: registry.json's `capability` Technique, see
 * persistence/index.ts:616). Wraps an already-real implementation (a
 * registry Technique, an Agent, ...) so it becomes reachable through an
 * Order's `requires:[capability ids]` -- never invents one. `source.path`
 * is only resolved into a `providedBy` edge when it points at an `.agent`
 * (persistence/index.ts:721); pointing it at anything else (e.g. a registry
 * Technique's own script) is accepted but stays undecorated documentation.
 * Additive: never overwrites an existing file.
 */
export async function createDrakarCapability(
  labDir: string,
  id: string,
  description: string,
  source?: { type: string; path: string },
): Promise<string> {
  const dir = path.join(labDir, 'declarations', 'capabilities');
  await mkdir(dir, { recursive: true });
  const slug = id.replace(/\./g, '-');
  const filePath = path.join(dir, `${slug}.drakar.json`);
  try {
    await readFile(filePath, 'utf-8');
    throw new Error(`refusing to overwrite existing ${filePath}`);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
  const doc: Record<string, unknown> = { kind: 'capability', version: 1, id, description };
  if (source) doc.source = source;
  await writeFile(filePath, JSON.stringify(doc, null, 2) + '\n', 'utf-8');
  return filePath;
}

/**
 * Creates a new NEXO `agent/1` `.agent` document under
 * `<lab>/declarations/agents/` — a minimal, real (nexo.exe-validatable)
 * agent whose only job is to be the reachable provider a `*.drakar.json`
 * capability's `source.path` can point at (persistence/index.ts:721 only
 * resolves `providedBy` when the path lands on a real `.agent`). It never
 * authors the capability's actual implementation — `goal`/`knowledge` must
 * describe confirming/reading the already-real file named by
 * `contextFiles`, never generating or changing it. Additive: never
 * overwrites an existing file.
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

/**
 * Creates a new `*.drakar.json` with `"kind":"agent"`, `"runner":"claude"` under
 * `<lab>/declarations/agents/` — a worldctl-owned Agent document (unlike NEXO's
 * `agent/1` schema above, this format has no external validator) whose `chat`/`run`/
 * `build`/`run-capability` target spawns `claude -p` instead of `nexo.exe run` (see
 * cli/claude-runner.ts). `promptFile`/`policyFiles` are optional and resolved relative to
 * this document (persistence/index.ts), same as a capability's `source.path` — omitting
 * `promptFile` falls back to worldctl's own built-in Core+policies
 * (prompts/promptLoader.ts's `DEFAULT_CORE`/`DEFAULT_POLICIES`). `policyFiles` without
 * `promptFile` is meaningless and rejected by the caller (mutate/apply.ts). Additive:
 * never overwrites an existing file.
 */
export async function createClaudeAgentDocument(
  labDir: string,
  name: string,
  description: string,
  capabilities: string[],
  promptFile?: string,
  policyFiles?: string[],
): Promise<string> {
  const dir = path.join(labDir, 'declarations', 'agents');
  await mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `${name}.drakar.json`);
  try {
    await readFile(filePath, 'utf-8');
    throw new Error(`refusing to overwrite existing ${filePath}`);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
  const doc: Record<string, unknown> = {
    kind: 'agent',
    version: 1,
    id: name,
    description,
    runner: 'claude',
    ...(promptFile ? { promptFile } : {}),
    ...(promptFile && policyFiles && policyFiles.length > 0 ? { policyFiles } : {}),
    ...(capabilities.length > 0 ? { requires: capabilities } : {}),
  };
  await writeFile(filePath, JSON.stringify(doc, null, 2) + '\n', 'utf-8');
  return filePath;
}
