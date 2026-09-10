import { readFile } from '../../util/traced-fs.js';

/**
 * One `registry/techniques/*.json` entry, `cap-tech-pipe-lab`-shaped
 * (schema/technique.schema.json) — no `kind` field, matched by directory
 * (persistence/index.ts), not by content. Read leniently: only `id` is
 * required here, the Lab's own `packages/core/src/validate.ts` (Ajv against
 * the real schema) is the actual gate, this is worldctl indexing evidence
 * of an already-valid registry, not re-validating it.
 */
export interface CapTechTechniqueDocument {
  id?: string;
  capability?: string;
  title?: string;
  summary?: string;
  origin?: string;
  profileAffinity?: string[];
  consumesArtifacts?: string[];
  producesArtifacts?: string[];
  determinism?: string;
  notes?: string[];
}

export async function parseCapTechTechnique(path: string): Promise<CapTechTechniqueDocument> {
  const text = await readFile(path, 'utf-8');
  return JSON.parse(text) as CapTechTechniqueDocument;
}
