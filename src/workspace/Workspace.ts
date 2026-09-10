/**
 * A place worldctl reads and writes named documents, addressed by a
 * workspace-relative path (posix-style, like every other path in this
 * codebase -- see model/refs.ts's `id`). Every caller that goes through
 * this interface instead of `node:fs` directly stays agnostic to WHERE
 * the documents actually live -- a local folder today (`FileSystemWorkspace`),
 * something else later (Firestore, an HTTP-backed remote workspace, ...)
 * without its own code changing.
 *
 * Scope, deliberately: this is the write/mutate-side abstraction (today's
 * one real consumer is `ProposalStore`). worldctl's much larger read-side
 * Lab scan (`persistence/index.ts`, `quickstarts/scan.ts`) still goes
 * through `util/traced-fs.ts` directly -- folding that recursive,
 * multi-format scan behind this same interface is future work, not part
 * of this step.
 */
export interface Workspace {
  /** Reads a document's text content. Rejects if it does not exist. */
  read(path: string): Promise<string>;
  /** Writes a document's text content, creating any missing parent directories. */
  write(path: string, text: string): Promise<void>;
  /** True if a document exists at this path. */
  exists(path: string): Promise<boolean>;
  /** Filenames directly under `path` (not recursive), or `[]` if `path` does not exist. */
  list(path: string): Promise<string[]>;
  /** Removes a document. Not an error if it does not already exist. */
  delete(path: string): Promise<void>;
}
