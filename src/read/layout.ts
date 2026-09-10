import type { Layout } from '../model/layout.js';
import { formatRef } from '../model/refs.js';
import type { WorldProjection } from '../persistence/index.js';

/** QUERIES, never writes (doc §5). All Layouts in the projection, optionally scoped to one Lab. */
export function listLayouts(projection: WorldProjection, labId?: string): Layout[] {
  const all = [...projection.layouts.values()];
  const scoped = labId ? all.filter((l) => l.labRef?.id === labId) : all;
  return scoped.sort((a, b) => formatRef(a.ref).localeCompare(formatRef(b.ref)));
}

/** Case-insensitive substring match on id/name -- same shape as read/content.ts's findContent(). */
export function findLayouts(projection: WorldProjection, term: string): Layout[] {
  const needle = term.toLowerCase();
  return listLayouts(projection).filter((l) => `${l.ref.id} ${l.name ?? ''}`.toLowerCase().includes(needle));
}
