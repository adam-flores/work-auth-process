import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SCHEMA, SCHEMA_VERSION } from "./schema.ts";
import { Participant } from "../shared/rules.ts";
import type { Participant as ParticipantRecord } from "../shared/rules.ts";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

/** Where the store lives by default. Disposable: deleting it loses nothing that
 *  seeding cannot put back (ADR-0008). */
export const DEFAULT_STORE_PATH = resolve(repoRoot, ".store/work-auth.db");

const SEED_PATH = resolve(repoRoot, "config/participants.json");

export type Store = {
  readonly db: DatabaseSync;
  reseed(): void;
  close(): void;
};

function readSeed(): ParticipantRecord[] {
  const raw: unknown = JSON.parse(readFileSync(SEED_PATH, "utf8"));
  const shape = (raw as { participants?: unknown }).participants;
  return Participant.array().parse(shape);
}

function seed(db: DatabaseSync): void {
  const participants = readSeed();
  db.exec("BEGIN");
  try {
    db.exec("DELETE FROM participants");
    const insert = db.prepare(
      "INSERT INTO participants (id, name, role, department) VALUES (?, ?, ?, ?)",
    );
    for (const p of participants) insert.run(p.id, p.name, p.role, p.department);

    const meta = db.prepare("INSERT OR REPLACE INTO store_meta (key, value) VALUES (?, ?)");
    meta.run("schema_version", String(SCHEMA_VERSION));
    meta.run("seeded_at", new Date().toISOString());
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

/**
 * Open the store, creating and seeding it if it is not there. First run and
 * hundredth run take the same path, which is what makes a cold clone work
 * without a setup step.
 */
export function openStore(storePath: string = DEFAULT_STORE_PATH): Store {
  mkdirSync(dirname(storePath), { recursive: true });
  const db = new DatabaseSync(storePath);
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(SCHEMA);

  const seeded = db.prepare("SELECT value FROM store_meta WHERE key = 'seeded_at'").get();
  if (!seeded) seed(db);

  return {
    db,
    reseed: () => seed(db),
    close: () => db.close(),
  };
}
