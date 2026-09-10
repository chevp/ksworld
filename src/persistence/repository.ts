import path from 'node:path';
import type { MutationOperation } from '../mutate/operations.js';
import { applyMutation as runMutation } from '../mutate/apply.js';
import type { Ref } from '../model/refs.js';
import { formatRef, isRefKind } from '../model/refs.js';
import type { WorldObject } from '../graph/world-graph.js';
import { buildProjection, type WorldProjection } from './index.js';

/**
 * `load`/`save`/`list`/`resolve`/`applyMutation` (doc §7's WorldRepository
 * interface). `labs/**` is read-only source of truth for `load` — a
 * mutation always ends by writing back to disk (mutate/apply.ts) and the
 * projection is re-derived from that write (doc §1), never patched in place.
 */
export class WorldRepository {
  private projection: WorldProjection | undefined;

  constructor(private readonly root: string) {
    this.root = path.resolve(root);
  }

  async load(): Promise<WorldProjection> {
    this.projection = await buildProjection(this.root);
    return this.projection;
  }

  private async projectionOrLoad(): Promise<WorldProjection> {
    if (!this.projection) await this.load();
    return this.projection!;
  }

  async list(kind: string): Promise<Ref[]> {
    if (!isRefKind(kind)) throw new Error(`unknown kind "${kind}"`);
    const projection = await this.projectionOrLoad();
    return projection.graph.allRefs().filter((ref) => ref.kind === kind);
  }

  async resolve<T extends WorldObject = WorldObject>(ref: Ref): Promise<T | undefined> {
    const projection = await this.projectionOrLoad();
    return projection.graph.resolve<T>(ref);
  }

  async applyMutation(operation: MutationOperation): Promise<string[]> {
    const projection = await this.projectionOrLoad();
    const touchedFiles = await runMutation(projection, operation);
    await this.load(); // re-derive projection from the write (doc §1)
    return touchedFiles;
  }

  getRoot(): string {
    return this.root;
  }
}

export { formatRef };
