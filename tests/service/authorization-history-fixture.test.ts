import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { createService } from "../../src/service/index.ts";
import { seedAuthorizationHistory } from "../../src/fixtures/authorization-history.ts";
import { withTempStore } from "../helpers/temp-store.ts";

/**
 * The fixture generator (#65, ADR-0006): a body of synthetic authorizations
 * with full transition histories, produced entirely through the service seam
 * rather than written directly into the store. Every assertion below reads
 * back what the real command surface produced - if the generator ever tried
 * a sequence the product could not have produced, the service itself would
 * have thrown before this file ever saw the result.
 */

const SYSTEM = { participantId: "system" };

describe("the seeded authorization history", () => {
  let store: ReturnType<typeof withTempStore>;
  let service: ReturnType<typeof createService>;

  before(() => {
    store = withTempStore();
    service = createService({ storePath: store.path });
    service.resetStore(SYSTEM);
    seedAuthorizationHistory(service);
  });
  after(() => {
    service.close();
    store.cleanup();
  });

  test("produces more than one authorization, none of it thrown out by the service", () => {
    const { authorizations } = service.listDashboard(SYSTEM);
    assert.ok(authorizations.length >= 6, "expected a real body of seeded history, not a token example");
  });

  test("re-running from empty is repeatable", () => {
    // A genuinely empty store, not this file's shared one: `resetStore`
    // returns the *reference* data (participants, hierarchy, permissibility)
    // to its seeded state, but deliberately leaves domain data - drafts and
    // the transition log - alone across a reseed (`tests/service/drafts.test.ts`).
    // "From empty" is a fresh store, the same as a deleted `.store/` file.
    const freshStore = withTempStore();
    try {
      const freshService = createService({ storePath: freshStore.path });
      try {
        seedAuthorizationHistory(freshService);
        const before = service.listDashboard(SYSTEM).authorizations.length;
        const after = freshService.listDashboard(SYSTEM).authorizations.length;
        assert.equal(after, before);
      } finally {
        freshService.close();
      }
    } finally {
      freshStore.cleanup();
    }
  });

  test("includes every transition kind ADR-0006 names", () => {
    const { authorizations } = service.listDashboard(SYSTEM);

    assert.ok(
      authorizations.some((a) => a.chargeNumber !== null),
      "expected at least one minted, completed authorization",
    );
    assert.ok(
      authorizations.some((a) => a.withdrawnAt !== null),
      "expected at least one withdrawn authorization",
    );
    assert.ok(
      authorizations.some((a) => a.revokedAt !== null),
      "expected at least one revoked authorization",
    );
    assert.ok(
      authorizations.some((a) => a.awaitingCorrection && a.correctionRequest !== null),
      "expected at least one authorization currently awaiting a correction",
    );
    assert.ok(
      authorizations.some((a) => a.stageHistory.some((visit) => visit.reReviewCause !== undefined)),
      "expected at least one re-review, reaching back to an already-resolved stage",
    );
    assert.ok(
      authorizations.some((a) => a.holdIntervals.length > 0),
      "expected at least one authorization that was held",
    );
    assert.ok(
      authorizations.some((a) => a.holdIntervals.some((span) => span.releasedAt !== null)),
      "expected at least one hold that was released again",
    );
    assert.ok(
      authorizations.some((a) => a.referrals.length > 0),
      "expected at least one referral",
    );
    assert.ok(
      authorizations.some((a) => a.stageHistory.length > 1),
      "expected at least one authorization to have arrived past its first stage",
    );
  });

  test("leaves a mix of open and terminal authorizations for a live demo to build on", () => {
    const { authorizations } = service.listDashboard(SYSTEM);
    const isTerminal = (a: (typeof authorizations)[number]) =>
      a.chargeNumber !== null || a.withdrawnAt !== null || a.revokedAt !== null;

    assert.ok(authorizations.some(isTerminal), "expected terminal authorizations for the insights fold");
    assert.ok(authorizations.some((a) => !isTerminal(a)), "expected open authorizations for a demo to click through");
  });

  test("every timestamp is in the past, spread over a plausible period", () => {
    const { authorizations } = service.listDashboard(SYSTEM);
    const now = Date.now();

    const stamps = authorizations.flatMap((a) => [
      a.initiatedAt,
      ...a.stageHistory.flatMap((visit) => [visit.arrivedAt, visit.notifiedAt, visit.resolvedAt].filter((s) => s !== null)),
      ...a.holdIntervals.flatMap((span) => [span.heldAt, span.releasedAt].filter((s) => s !== null)),
      ...a.referrals.map((r) => r.referredAt),
    ]);

    assert.ok(stamps.length > 0);
    for (const stamp of stamps) {
      assert.ok(new Date(stamp).getTime() <= now, `found a timestamp in the future: ${stamp}`);
    }

    const initiations = authorizations.map((a) => new Date(a.initiatedAt).getTime());
    const earliest = Math.min(...initiations);
    const latest = Math.max(...initiations);
    const spanDays = (latest - earliest) / (24 * 60 * 60 * 1000);
    assert.ok(spanDays > 30, `expected initiations spread over more than a month, got ${spanDays.toFixed(1)} days`);

    // The newest seeded activity leaves room behind it - a live demo's own
    // clicking (which defaults `occurredAt` to "now") is always the newest
    // thing in the log, never buried in the middle of seeded history.
    const newestSeeded = Math.max(...stamps.map((s) => new Date(s).getTime()));
    assert.ok(now - newestSeeded > 60 * 60 * 1000, "expected seeded history to end at least an hour before now");
  });

  test("folds to sane cycle-time figures for the completed authorizations", () => {
    const { authorizations } = service.listDashboard(SYSTEM);
    const completed = authorizations.filter((a) => a.chargeNumber !== null);
    assert.ok(completed.length > 0);

    for (const authorization of completed) {
      const mintVisit = authorization.stageHistory[authorization.stageHistory.length - 1]!;
      assert.equal(mintVisit.stageId, "charge-number-admin");
      assert.ok(mintVisit.resolvedAt !== null);

      const cycleTimeMs = new Date(mintVisit.resolvedAt).getTime() - new Date(authorization.initiatedAt).getTime();
      // Sane, not exact: strictly positive (nothing completes before it
      // starts), and short enough that a fold over it could never be
      // mistaken for a data error - these are demo authorizations, not
      // ones that plausibly take longer than the seed's own span to close.
      assert.ok(cycleTimeMs > 0, "cycle time must be positive");
      assert.ok(cycleTimeMs < 200 * 24 * 60 * 60 * 1000, "cycle time is implausibly long");
    }
  });

  test("held time is tracked separately from the stages it interrupts", () => {
    const { authorizations } = service.listDashboard(SYSTEM);
    const held = authorizations.find((a) => a.holdIntervals.some((span) => span.releasedAt !== null));
    assert.ok(held, "expected a seeded authorization with a closed hold interval");

    for (const span of held.holdIntervals) {
      if (span.releasedAt === null) continue;
      const heldMs = new Date(span.releasedAt).getTime() - new Date(span.heldAt).getTime();
      assert.ok(heldMs > 0, "a hold interval must close after it opens");
    }
  });
});
