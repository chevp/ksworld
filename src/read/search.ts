import type { Ref, RefKind } from '../model/refs.js';
import type { WorldProjection } from '../persistence/index.js';

export interface SearchHit {
  ref: Ref;
  name: string;
  summary?: string;
}

/** QUERIES, never writes (doc §5). Case-insensitive substring match on id/name/summary/description. */
export function search(projection: WorldProjection, kind: RefKind, term: string): SearchHit[] {
  const needle = term.toLowerCase();
  const hits: SearchHit[] = [];
  for (const ref of projection.graph.allRefs()) {
    if (ref.kind !== kind) continue;
    const obj = projection.graph.resolve(ref) as Record<string, unknown> | undefined;
    const name = typeof obj?.name === 'string' ? obj.name : ref.id;
    const summary =
      (typeof obj?.summary === 'string' && obj.summary) ||
      (typeof obj?.description === 'string' && obj.description) ||
      (typeof obj?.readmeSummary === 'string' && obj.readmeSummary) ||
      undefined;
    const haystack = `${ref.id} ${name} ${summary ?? ''}`.toLowerCase();
    if (haystack.includes(needle)) hits.push({ ref, name, summary });
  }
  return hits;
}
