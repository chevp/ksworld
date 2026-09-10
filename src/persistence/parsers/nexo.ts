import { readFile } from '../../util/traced-fs.js';

export interface NexoNetworkNode {
  id?: string;
  agent?: string;
}

export interface NexoDocument {
  kind?: string;
  name?: string;
  description?: string;
  /** nexo/1: single pointer at an Agent/Workflow/Recipe. */
  target?: { type?: string; path?: string };
  /** nexo/2, nexo/4, nexo/5: id of the `network.nodes[]` entry point (the agent-network's own vocabulary). */
  entry?: string;
  /** nexo/2, nexo/4, nexo/5: an agent-network — always Agent nodes, never Workflow/Recipe directly. */
  network?: { nodes?: NexoNetworkNode[] };
}

export async function parseNexoDocument(path: string): Promise<NexoDocument> {
  const text = await readFile(path, 'utf-8');
  return JSON.parse(text) as NexoDocument;
}
