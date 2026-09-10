import { randomBytes } from 'node:crypto';
import path from 'node:path';
import type { Diff } from '../validate/diff.js';
import type { MutationOperation } from '../mutate/operations.js';
import type { Workspace } from '../workspace/Workspace.js';

export interface Proposal {
  id: string;
  operation: MutationOperation;
  diff: Diff;
  createdAt: string;
}

/**
 * Local pending store, deliberately outside `labs/**` (doc §8.2/§9).
 * `propose` writes here and stops; `apply <id>` is the only command that
 * reads from here and then persists into `labs/**`.
 *
 * Backed by a `Workspace` rather than `node:fs` directly -- everything here
 * is already shaped like a `DocumentStore` (get/put/delete/list by id), so
 * this is the first real, non-toy proof that the abstraction fits: swap the
 * `FileSystemWorkspace` passed in at construction (see cli/worldctl.ts) for
 * a different `Workspace` implementation later, and none of this class
 * changes.
 */
export class ProposalStore {
  constructor(private readonly workspace: Workspace) {}

  private fileFor(id: string): string {
    // Workspace paths are posix-style regardless of host OS (see
    // Workspace.ts) -- not `path.join`, which would emit backslashes on
    // Windows and disagree with FileSystemWorkspace's own `path.join`
    // against its root.
    return path.posix.join('proposals', `${id}.json`);
  }

  async save(operation: MutationOperation, diff: Diff): Promise<Proposal> {
    const id = randomBytes(3).toString('hex');
    const proposal: Proposal = { id, operation, diff, createdAt: new Date().toISOString() };
    await this.workspace.write(this.fileFor(id), JSON.stringify(proposal, null, 2) + '\n');
    return proposal;
  }

  async load(id: string): Promise<Proposal> {
    const text = await this.workspace.read(this.fileFor(id));
    return JSON.parse(text) as Proposal;
  }

  async remove(id: string): Promise<void> {
    await this.workspace.delete(this.fileFor(id));
  }

  async list(): Promise<Proposal[]> {
    const entries = await this.workspace.list('proposals');
    const proposals = await Promise.all(
      entries.filter((name) => name.endsWith('.json')).map((name) => this.load(name.replace(/\.json$/, ''))),
    );
    return proposals;
  }
}
