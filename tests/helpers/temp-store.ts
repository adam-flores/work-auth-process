import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * A real SQLite store on a temporary file, as the spec's testing decisions
 * require — not an in-memory fake and not a mock of the store module.
 */
export function withTempStore(): { path: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "work-auth-test-"));
  return {
    path: join(dir, "store.db"),
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}
