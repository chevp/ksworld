import { readFile } from '../../util/traced-fs.js';

export interface AgentDelegate {
  id: string;
  agent: string;
  description?: string;
}

export interface AgentDocument {
  kind?: string;
  name?: string;
  description?: string;
  capabilities?: string[];
  delegates?: AgentDelegate[];
}

export async function parseAgentDocument(path: string): Promise<AgentDocument> {
  const text = await readFile(path, 'utf-8');
  return JSON.parse(text) as AgentDocument;
}
