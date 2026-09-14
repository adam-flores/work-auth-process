import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { createService } from "../../src/service/index.ts";
import { withTempStore } from "../helpers/temp-store.ts";

describe("queries", () => {
  let store: ReturnType<typeof withTempStore>;
  let service: ReturnType<typeof createService>;

  before(() => {
    store = withTempStore();
    service = createService({ storePath: store.path });
  });
  after(() => {
    service.close();
    store.cleanup();
  });

  test("the store is created and seeded on first use", () => {
    const info = service.getStoreInfo({ participantId: "system" });
    assert.equal(info.schemaVersion, 1);
    assert.ok(info.participantCount > 0, "expected seeded participants");
    assert.ok(info.seededAt.length > 0, "expected a seeded timestamp");
  });

  test("listParticipants returns the seeded roster", () => {
    const people = service.listParticipants({ participantId: "system" });
    assert.ok(people.length > 0);
    for (const p of people) {
      assert.ok(p.id.length > 0);
      assert.ok(p.name.length > 0);
      assert.ok(p.role.length > 0);
    }
  });

  test("the four roles of the cast are represented, and Submitter is not one of them", () => {
    // Widened to string deliberately: the role type already excludes "Submitter",
    // so without this the compiler rejects the assertion below rather than
    // letting it run. Both checks are wanted - the type stops it being written,
    // this stops it being seeded.
    const roles: Set<string> = new Set(
      service.listParticipants({ participantId: "system" }).map((p) => p.role),
    );
    for (const expected of ["Contributor", "Approver", "Charge Number Admin", "Administrator"]) {
      assert.ok(roles.has(expected), `no seeded participant holds the role ${expected}`);
    }
    // CONTEXT.md, The cast: Submitter is a relationship to one authorization -
    // the individual who created it - rather than a role anybody holds.
    assert.ok(!roles.has("Submitter"), "Submitter is not a role a participant holds");
  });

  test("the roster is read from the store, not from the seed file", () => {
    // Proves the read path goes through SQLite rather than the JSON on disk.
    service.__unsafeRawExec("DELETE FROM participants");
    assert.deepEqual(service.listParticipants({ participantId: "system" }), []);
  });
});
