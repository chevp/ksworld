import path from 'node:path';
import type { Experience } from '../learn/experience.js';
import type { Workspace } from '../workspace/Workspace.js';

/**
 * Local, append-only store for `Experience` records, same shape/placement as
 * `ProposalStore` (proposals.ts) -- `--state-dir`, outside `labs/**`. Nothing
 * ever deletes an Experience; `worldctl learn record` only ever adds one.
 */
export class ExperienceStore {
  constructor(private readonly workspace: Workspace) {}

  private fileFor(id: string): string {
    return path.posix.join('experiences', `${id}.json`);
  }

  async save(experience: Experience): Promise<Experience> {
    await this.workspace.write(this.fileFor(experience.id), JSON.stringify(experience, null, 2) + '\n');
    return experience;
  }

  async load(id: string): Promise<Experience> {
    const text = await this.workspace.read(this.fileFor(id));
    return JSON.parse(text) as Experience;
  }

  async list(): Promise<Experience[]> {
    const entries = await this.workspace.list('experiences');
    const experiences = await Promise.all(
      entries.filter((name) => name.endsWith('.json')).map((name) => this.load(name.replace(/\.json$/, ''))),
    );
    return experiences.sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
  }
}
