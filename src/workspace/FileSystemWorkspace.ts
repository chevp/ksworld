import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { trace } from '../cli/trace.js';
import type { Workspace } from './Workspace.js';

/**
 * Today's (only) `Workspace` implementation: a folder on local disk. Every
 * path a caller passes in is relative to `root` -- the same
 * workspace-relative convention `WorkspaceService` uses on the
 * frost-desktop/native side (`runtime/iris/tools/frost-desktop/src/
 * services/WorkspaceService.cpp`), so the two ends of this system already
 * agree on what "a path" means.
 */
export class FileSystemWorkspace implements Workspace {
  constructor(private readonly root: string) {}

  private resolve(relative: string): string {
    return path.join(this.root, relative);
  }

  async read(relative: string): Promise<string> {
    const absolute = this.resolve(relative);
    trace(`read   ${absolute}`);
    return readFile(absolute, 'utf-8');
  }

  async write(relative: string, text: string): Promise<void> {
    const absolute = this.resolve(relative);
    trace(`write  ${absolute}`);
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, text, 'utf-8');
  }

  async exists(relative: string): Promise<boolean> {
    try {
      await stat(this.resolve(relative));
      return true;
    } catch {
      return false;
    }
  }

  async list(relative: string): Promise<string[]> {
    const absolute = this.resolve(relative);
    trace(`ls     ${absolute}`);
    try {
      return await readdir(absolute);
    } catch {
      return [];
    }
  }

  async delete(relative: string): Promise<void> {
    const absolute = this.resolve(relative);
    trace(`rm     ${absolute}`);
    await rm(absolute, { force: true });
  }
}
