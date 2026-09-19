import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createService } from "../../src/service/index.ts";
import { createDemoRunner } from "../../src/demo/index.ts";
import { DomainError } from "../../src/service/errors.ts";
import { withTempStore } from "../helpers/temp-store.ts";

/**
 * The demo module's own seam (#94), parallel to `tests/service/*.test.ts`.
 * Drives `start`, `advance` through every step, `pause`/`resume` mid-script,
 * and `reset` directly against the runner, asserting on its own status/step
 * shape and on the underlying authorization's state via the same service
 * queries a real client would use - never against Playwright timing (#94's
 * testing decisions).
 *
 * The script itself is happy-path only (#94 follow-up): an earlier version
 * raised a correction request mid-script, cut after a first walkthrough
 * showed it asked an audience to track more than a three-minute demo can
 * afford (see `src/demo/script.ts`'s own doc comment).
 */

describe("the scripted demo runner", () => {
  let store: ReturnType<typeof withTempStore>;
  let service: ReturnType<typeof createService>;
  let runner: ReturnType<typeof createDemoRunner>;

  before(() => {
    store = withTempStore();
    service = createService({ storePath: store.path });
  });
  after(() => {
    service.close();
    store.cleanup();
  });
  beforeEach(() => {
    // A fresh runner per test, on a store wiped of whatever the previous
    // test (including its own `runner.reset()`, which now seeds synthetic
    // history) left behind - `reset`'s own store-clearing behavior is
    // exercised directly by the "reset" tests below, not relied on here.
    service.resetStore({ participantId: "system" }, { wipeProcessData: true });
    runner = createDemoRunner(service);
  });

  function runToCompletion(): ReturnType<typeof runner.getState> {
    runner.start();
    let state = runner.getState();
    while (state.status === "running") state = runner.advance();
    return state;
  }

  describe("idle", () => {
    test("begins idle, at step 0, with no authorization yet", () => {
      const state = runner.getState();
      assert.equal(state.status, "idle");
      assert.equal(state.stepIndex, 0);
      assert.ok(state.totalSteps > 0);
      assert.equal(state.authorizationId, null);
      assert.equal(state.current, null);
    });

    test("advance is a no-op while idle", () => {
      const state = runner.advance();
      assert.equal(state.status, "idle");
      assert.equal(state.stepIndex, 0);
    });

    test("pause is refused while idle", () => {
      assert.throws(
        () => runner.pause(),
        (err: unknown) => err instanceof DomainError && err.code === "DEMO_NOT_RUNNING",
      );
    });

    test("resume is refused while idle", () => {
      assert.throws(
        () => runner.resume(),
        (err: unknown) => err instanceof DomainError && err.code === "DEMO_NOT_PAUSED",
      );
    });
  });

  describe("start", () => {
    test("moves to running", () => {
      const state = runner.start();
      assert.equal(state.status, "running");
      assert.equal(state.stepIndex, 0);
    });

    test("cannot be started twice without a reset between", () => {
      runner.start();
      assert.throws(
        () => runner.start(),
        (err: unknown) => err instanceof DomainError && err.code === "DEMO_NOT_IDLE",
      );
    });
  });

  describe("advancing through the whole script", () => {
    test("reaches finished, having genuinely moved the authorization through the relay", () => {
      const state = runToCompletion();
      assert.equal(state.status, "finished");
      assert.equal(state.stepIndex, state.totalSteps);
      assert.ok(state.authorizationId);

      const authorization = service.getAuthorization({ participantId: "system" }, state.authorizationId!);
      assert.equal(authorization.currentStageId, "charge-number-admin");
      assert.equal(authorization.chargeNumber, "CN-DEMO-0001");
      assert.equal(authorization.awaitingCorrection, false);
      assert.equal(authorization.performingEmployee, "Sam Ridley");
    });

    test("advance past the end is a no-op that stays finished", () => {
      runToCompletion();
      const state = runner.advance();
      assert.equal(state.status, "finished");
    });

    test("each advance reports which tab and participant the presenter's screen should show", () => {
      runner.start();
      const first = runner.advance();
      assert.equal(first.current?.index, 0);
      assert.equal(first.current?.tabId, "submit");
      assert.equal(first.current?.actingId, "p-jordan-hale");

      const second = runner.advance();
      assert.equal(second.current?.index, 1);
      assert.equal(second.current?.tabId, "my-queue");
      assert.equal(second.current?.actingId, "p-priya-anand");
    });
  });

  describe("pause and resume", () => {
    test("pause stops advancing; a poll during the pause changes nothing", () => {
      runner.start();
      runner.advance();
      runner.advance();
      const paused = runner.pause();
      assert.equal(paused.status, "paused");
      const stepIndexAtPause = paused.stepIndex;

      const polled = runner.advance();
      assert.equal(polled.status, "paused");
      assert.equal(polled.stepIndex, stepIndexAtPause);
    });

    test("continue resumes exactly where it paused", () => {
      runner.start();
      runner.advance();
      runner.advance();
      runner.pause();
      const resumed = runner.resume();
      assert.equal(resumed.status, "running");

      const next = runner.advance();
      assert.equal(next.stepIndex, 3);
      assert.equal(next.current?.index, 2);
    });

    test("pause is refused while already paused", () => {
      runner.start();
      runner.pause();
      assert.throws(
        () => runner.pause(),
        (err: unknown) => err instanceof DomainError && err.code === "DEMO_NOT_RUNNING",
      );
    });
  });

  describe("reset", () => {
    test("returns the runner to idle at step 0 with no authorization", () => {
      runner.start();
      runner.advance();
      runner.advance();
      const state = runner.reset();
      assert.equal(state.status, "idle");
      assert.equal(state.stepIndex, 0);
      assert.equal(state.authorizationId, null);
      assert.equal(state.current, null);
    });

    test("clears the run's own drafts and authorizations, then seeds the synthetic history fixture", () => {
      const finished = runToCompletion();
      const ranAuthorizationId = finished.authorizationId!;

      runner.reset();
      const dashboard = service.listDashboard({ participantId: "system" });

      // The demo's own authorization is gone - a genuine wipe, not merely
      // superseded - and drafts never carry over a reset either way
      // (ADR-0009).
      assert.ok(!dashboard.authorizations.some((a) => a.id === ranAuthorizationId));
      assert.deepEqual(dashboard.drafts, []);

      // In its place: the same synthetic history `npm run reset` seeds
      // (#65, ADR-0006) - so Insights and the master dashboard have real
      // figures to show a presenter who has not started the script yet
      // (#94 follow-up), rather than every measure reading zero.
      assert.ok(dashboard.authorizations.length > 0);
    });

    test("is valid mid-run, not only once idle or finished", () => {
      runner.start();
      runner.advance();
      const state = runner.reset();
      assert.equal(state.status, "idle");
    });

    test("the runner can be started again after a reset", () => {
      runToCompletion();
      runner.reset();
      const state = runner.start();
      assert.equal(state.status, "running");
    });
  });
});
