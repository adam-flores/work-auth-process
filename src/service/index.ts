import { openStore, DEFAULT_STORE_PATH } from "../store/index.ts";
import { ActingParticipant, SYSTEM_PARTICIPANT_ID } from "../shared/rules.ts";
import type { Participant } from "../shared/rules.ts";
import { DomainError } from "./errors.ts";

/**
 * The seam.
 *
 * Every process decision this product makes is reachable from here, as a typed
 * function taking the acting participant first (ADR-0010). Tests drive these
 * functions in-process against a real store; the HTTP layer is a thin adapter
 * over the same table and holds no logic of its own.
 */

export type StoreInfo = {
  schemaVersion: number;
  seededAt: string;
  participantCount: number;
};

export type ServiceOptions = { storePath?: string };

export function createService(options: ServiceOptions = {}) {
  const store = openStore(options.storePath ?? DEFAULT_STORE_PATH);
  const { db } = store;

  /** Validates who is acting. Not authentication - identity is mocked - but a
   *  command still may not name somebody who does not exist. */
  function requireParticipant(ctx: unknown): string {
    const parsed = ActingParticipant.safeParse(ctx);
    if (!parsed.success) {
      throw new DomainError("INVALID_REQUEST", parsed.error.issues[0]?.message ?? "Invalid request.");
    }
    const { participantId } = parsed.data;
    if (participantId === SYSTEM_PARTICIPANT_ID) return participantId;

    const found = db.prepare("SELECT id FROM participants WHERE id = ?").get(participantId);
    if (!found) {
      throw new DomainError("UNKNOWN_PARTICIPANT", `No participant with id "${participantId}".`);
    }
    return participantId;
  }

  function readStoreInfo(): StoreInfo {
    const meta = db.prepare("SELECT key, value FROM store_meta").all() as {
      key: string;
      value: string;
    }[];
    const byKey = new Map(meta.map((row) => [row.key, row.value]));
    const count = db.prepare("SELECT COUNT(*) AS n FROM participants").get() as { n: number };
    return {
      schemaVersion: Number(byKey.get("schema_version") ?? 0),
      seededAt: byKey.get("seeded_at") ?? "",
      participantCount: count.n,
    };
  }

  return {
    /** Who exists. Read from the store, not from the seed file on disk. */
    listParticipants(ctx: ActingParticipant): Participant[] {
      requireParticipant(ctx);
      return db
        .prepare("SELECT id, name, role, department FROM participants ORDER BY name")
        .all() as Participant[];
    },

    /** What the store is, so a demo can tell which seeding it is looking at. */
    getStoreInfo(ctx: ActingParticipant): StoreInfo {
      requireParticipant(ctx);
      return readStoreInfo();
    },

    /** Return the store to its seeded state. ADR-0008 makes the store
     *  disposable rather than migrated, which is what lets a demo be replayed. */
    resetStore(ctx: ActingParticipant): StoreInfo {
      requireParticipant(ctx);
      store.reseed();
      return readStoreInfo();
    },

    close(): void {
      store.close();
    },

    /**
     * Test-only escape hatch, so a test can put the store into a state the
     * command surface deliberately cannot reach. Never called by the server or
     * the web app; the name is meant to be uncomfortable.
     */
    __unsafeRawExec(sql: string): void {
      db.exec(sql);
    },
  };
}

export type Service = ReturnType<typeof createService>;
