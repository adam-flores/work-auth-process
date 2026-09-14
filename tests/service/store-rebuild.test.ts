import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { createService } from "../../src/service/index.ts";
import { SCHEMA_VERSION } from "../../src/store/schema.ts";
import { withTempStore } from "../helpers/temp-store.ts";

describe("a store from an older schema", () => {
  test("is rebuilt rather than read, because the store is disposable", () => {
    const store = withTempStore();
    try {
      // A store as an earlier version of the product left it: the table is
      // there, so CREATE TABLE IF NOT EXISTS will not touch it, but it has no
      // `department` column and every query that names one would throw.
      const old = new DatabaseSync(store.path);
      old.exec(`
        CREATE TABLE store_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        CREATE TABLE participants (id TEXT PRIMARY KEY, name TEXT NOT NULL, role TEXT NOT NULL);
        INSERT INTO store_meta (key, value) VALUES ('schema_version', '0');
        INSERT INTO store_meta (key, value) VALUES ('seeded_at', '2020-01-01T00:00:00.000Z');
        INSERT INTO participants (id, name, role) VALUES ('p-stale', 'Stale Person', 'Approver');
      `);
      old.close();

      const service = createService({ storePath: store.path });
      try {
        const info = service.getStoreInfo({ participantId: "system" });
        assert.equal(info.schemaVersion, SCHEMA_VERSION);
        assert.notEqual(info.seededAt, "2020-01-01T00:00:00.000Z");

        const people = service.listParticipants({ participantId: "system" });
        assert.ok(people.length > 0);
        assert.ok(people.every((p) => typeof p.department === "string" && p.department.length > 0));
        assert.ok(!people.some((p) => p.id === "p-stale"), "the stale row should not survive");
      } finally {
        service.close();
      }
    } finally {
      store.cleanup();
    }
  });
});
