import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { createService } from "../../src/service/index.ts";
import { seedInsightsHistory } from "../../src/demo/insights-history.ts";
import { withTempStore } from "../helpers/temp-store.ts";

const SYSTEM = { participantId: "system" };

/**
 * The demo's own historical-data fixture (#94 follow-up), distinct from
 * `src/fixtures/authorization-history.ts` and its own test
 * (`tests/service/authorization-history-fixture.test.ts`). Five completed
 * authorizations, produced entirely through the service seam - if the
 * generator ever tried a sequence the product could not have produced, the
 * service itself would have thrown before this file ever saw the result.
 */

describe("the demo's Insights history fixture", () => {
  let store: ReturnType<typeof withTempStore>;
  let service: ReturnType<typeof createService>;

  before(() => {
    store = withTempStore();
    service = createService({ storePath: store.path });
    seedInsightsHistory(service);
  });
  after(() => {
    service.close();
    store.cleanup();
  });

  test("seeds exactly five authorizations, every one completed", () => {
    const { authorizations } = service.listDashboard(SYSTEM);
    assert.equal(authorizations.length, 5);
    assert.ok(authorizations.every((a) => a.chargeNumber !== null));
    assert.ok(authorizations.every((a) => a.currentStageId === "charge-number-admin"));
    assert.ok(authorizations.every((a) => a.awaitingCorrection === false));
    assert.ok(authorizations.every((a) => !a.onHold));
  });

  test("no draft is left behind", () => {
    const { drafts } = service.listDashboard(SYSTEM);
    assert.deepEqual(drafts, []);
  });

  test("every cycle time falls within the stated 3-8 day band, averaging close to a week", () => {
    const { authorizations } = service.listDashboard(SYSTEM);
    const dayMs = 24 * 60 * 60 * 1000;
    const cycleDays = authorizations.map((a) => {
      const completedAt = a.stageHistory.at(-1)!.resolvedAt!;
      return (new Date(completedAt).getTime() - new Date(a.initiatedAt).getTime()) / dayMs;
    });
    // A small epsilon, not a stricter bound: `evenSteps` accumulates a
    // floating-point step size, so the last of seven additions can land a
    // fraction of a millisecond short of the exact target.
    for (const days of cycleDays) {
      assert.ok(days >= 3 - 0.001 && days <= 8 + 0.001, `expected a 3-8 day cycle, got ${days}`);
    }
    const average = cycleDays.reduce((sum, d) => sum + d, 0) / cycleDays.length;
    assert.ok(Math.abs(average - 6.4) < 0.01, `expected the average to be 6.4 days, got ${average}`);
  });

  test("leaves every queue empty - all five are terminal, none of them a demo's own live run", () => {
    assert.deepEqual(service.listMyQueue({ participantId: "p-priya-anand" }), []);
    assert.deepEqual(service.listMyQueue({ participantId: "p-marcus-oduya" }), []);
    assert.deepEqual(service.listMyQueue({ participantId: "p-jordan-hale" }), []);
    assert.deepEqual(service.listMyQueue({ participantId: "p-elin-vasquez" }), []);
    assert.deepEqual(service.listMyQueue({ participantId: "p-teo-brandt" }), []);
  });

  test("every completion lands safely in the past, so a live demo run is always the newest activity", () => {
    const { authorizations } = service.listDashboard(SYSTEM);
    const now = Date.now();
    for (const authorization of authorizations) {
      const completedAt = authorization.stageHistory.at(-1)!.resolvedAt!;
      assert.ok(new Date(completedAt).getTime() < now);
    }
  });
});
