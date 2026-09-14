import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SCHEMA, SCHEMA_VERSION } from "./schema.ts";
import { Participant } from "../shared/rules.ts";
import type { Participant as ParticipantRecord } from "../shared/rules.ts";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

/**
 * Where the store lives by default. Disposable: deleting it loses nothing that
 * seeding cannot put back (ADR-0008). `WORK_AUTH_STORE` points it somewhere
 * else, which is how the browser tests get a store of their own rather than
 * resetting the one a demo is sitting in.
 */
export const DEFAULT_STORE_PATH = process.env.WORK_AUTH_STORE
  ? resolve(process.env.WORK_AUTH_STORE)
  : resolve(repoRoot, ".store/work-auth.db");

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

/** The version the store on disk was built by, or null if it predates the key
 *  or has no store_meta table at all. */
function versionOnDisk(db: DatabaseSync): number | null {
  try {
    const row = db.prepare("SELECT value FROM store_meta WHERE key = 'schema_version'").get() as
      | { value: string }
      | undefined;
    return row ? Number(row.value) : null;
  } catch {
    return null;
  }
}

/** Drop everything and build it again. ADR-0008 makes the store disposable
 *  rather than migrated, so this is the whole of the upgrade story. */
function rebuild(db: DatabaseSync): void {
  db.exec("DROP TABLE IF EXISTS participants; DROP TABLE IF EXISTS store_meta;");
  db.exec(SCHEMA);
  seed(db);
}

/**
 * Open the store, building it if it is not there or was left by a different
 * schema. First run, hundredth run and post-upgrade run all take the same path,
 * which is what makes a cold clone work without a setup step.
 *
 * A store written by an older schema is rebuilt, not migrated. `CREATE TABLE IF
 * NOT EXISTS` cannot reshape a table that already exists, so without this an
 * older store would survive open and then throw on the first query naming a
 * column it does not have.
 */
export function openStore(storePath: string = DEFAULT_STORE_PATH): Store {
  mkdirSync(dirname(storePath), { recursive: true });
  const db = new DatabaseSync(storePath);
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(SCHEMA);

  if (versionOnDisk(db) !== SCHEMA_VERSION) rebuild(db);

  return {
    db,
    reseed: () => seed(db),
    close: () => db.close(),
  };
}
