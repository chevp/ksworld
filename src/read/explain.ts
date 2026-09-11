import type { Ref } from '../model/refs.js';
import type { WorldProjection } from '../persistence/index.js';

/**
 * QUERIES, never writes (doc §5's ASCII diagram lists `explain` alongside
 * `read`/`search`/`graph`/`impact`; §8.1 has no dedicated CLI command for
 * it, so `inspect` calls this for extra rationale lines on refs where it
 * has something non-obvious to say). Currently nothing has a non-obvious
 * rationale to add -- kept as the extension point `inspect` already calls.
 */
export async function explain(_projection: WorldProjection, _ref: Ref): Promise<string[]> {
  return [];
}
