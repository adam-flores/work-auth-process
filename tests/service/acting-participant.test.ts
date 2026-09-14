import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { createService } from "../../src/service/index.ts";
import { DomainError } from "../../src/service/errors.ts";
import { withTempStore } from "../helpers/temp-store.ts";

describe("the acting participant", () => {
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

  test("a command names a real participant and is accepted", () => {
    const someone = service.listParticipants({ participantId: "system" })[0]!;
    const info = service.resetStore({ participantId: someone.id });
    assert.ok(info.participantCount > 0);
  });

  test("a command naming an unknown participant is refused", () => {
    assert.throws(
      () => service.resetStore({ participantId: "nobody-at-all" }),
      (err: unknown) => {
        assert.ok(err instanceof DomainError);
        assert.equal(err.code, "UNKNOWN_PARTICIPANT");
        return true;
      },
    );
  });

  test("resetting returns the store to its seeded state", () => {
    const someone = service.listParticipants({ participantId: "system" })[0]!;
    service.__unsafeRawExec("DELETE FROM participants");
    assert.deepEqual(service.listParticipants({ participantId: "system" }), []);

    // `system` is the one identity that exists without being in the roster, so a
    // store emptied by accident can still be put back.
    const info = service.resetStore({ participantId: "system" });
    assert.ok(info.participantCount > 0);
    assert.ok(service.listParticipants({ participantId: someone.id }).length > 0);
  });
});
