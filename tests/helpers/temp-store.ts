import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

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

/**
 * Inserts an extra mocked participant directly into a temp store, bypassing
 * `config/participants.json` (#92: the seeded roster is sized for a live
 * demo - one holder per role/stage - and several service-seam tests need a
 * second holder of the same role and department, or one at a different
 * department, purely to prove a scoping rule. There is no product surface
 * that creates a participant (CONTEXT.md: every identity is mocked), so a
 * test that needs one beyond the demo roster adds it the same way any other
 * test here reaches past the service seam - direct SQL against the store it
 * already owns, exactly like the direct `transitions` reads elsewhere in this
 * suite.
 */
export function addTestParticipant(
  storePath: string,
  participant: { id: string; name: string; role: string; department: string },
): void {
  const db = new DatabaseSync(storePath);
  try {
    db.prepare("INSERT INTO participants (id, name, role, department) VALUES (?, ?, ?, ?)").run(
      participant.id,
      participant.name,
      participant.role,
      participant.department,
    );
  } finally {
    db.close();
  }
}
