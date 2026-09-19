import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { createService } from "../../src/service/index.ts";
import { withTempStore, addTestParticipant } from "../helpers/temp-store.ts";

/**
 * The insights dashboard's measures (#66, BDR-0006, ADR-0006): M1-M3 and the
 * held / awaiting-correction / re-review decompositions, every one a fold
 * over the transition log (`src/measures/index.ts`'s `computeMeasures`,
 * reached here through `service.getMeasures` exactly as the dashboard reads
 * it). Every scenario below drives the real command surface with explicit
 * `occurredAt` timestamps, an hour apart from a fixed base instant, so the
 * expected figures are exact rather than merely plausible.
 *
 * The fixture departments are the same ones `correction.test.ts` and
 * `re-review.test.ts` already use: "Rotor Assemblies" (requesting) and
 * "Flight Controls Software" (performing). The demo roster (#92) seeds only
 * one Approver at the requesting department, but this suite's authorization
 * 4 refers from one requesting-side Approver to another - a real second
 * requesting Approver is added directly to this test's own store
 * (`addTestParticipant`), the same pattern `correction.test.ts` and
 * `queues.test.ts` use, since a self-referral is refused (`referral.test.ts`)
 * and the seeded roster has no second holder to refer to.
 */

const SYSTEM = { participantId: "system" };
const BASE = new Date("2020-01-01T00:00:00.000Z").getTime();
const HOUR = 60 * 60 * 1000;

function at(hours: number): { occurredAt: string } {
  return { occurredAt: new Date(BASE + hours * HOUR).toISOString() };
}

describe("the insights dashboard's measures", () => {
  let store: ReturnType<typeof withTempStore>;
  let service: ReturnType<typeof createService>;
  let submitter: string;
  let requestingApproverA: string;
  let requestingApproverB: string;
  let performingApproverA: string;
  let contributorAtPerformingDept: string;
  let requestingDeptId: string;
  let performingDeptId: string;

  before(() => {
    store = withTempStore();
    service = createService({ storePath: store.path });
    addTestParticipant(store.path, {
      id: "p-test-second-requesting-approver",
      name: "Test Second Requesting Approver",
      role: "Approver",
      department: "Rotor Assemblies",
    });

    const people = service.listParticipants(SYSTEM);
    submitter = people.find((p) => p.id === "p-teo-brandt")!.id;
    requestingApproverA = people.find((p) => p.id === "p-priya-anand")!.id;
    requestingApproverB = people.find((p) => p.id === "p-test-second-requesting-approver")!.id;
    performingApproverA = people.find((p) => p.id === "p-marcus-oduya")!.id;
    contributorAtPerformingDept = people.find((p) => p.id === "p-jordan-hale")!.id;

    const departments = service.searchDepartments(SYSTEM);
    requestingDeptId = departments.find((d) => d.name === "Rotor Assemblies")!.id;
    performingDeptId = departments.find((d) => d.name === "Flight Controls Software")!.id;

    function initiateAuthorization(project: string) {
      const draft = service.createDraft(
        { participantId: submitter },
        {
          project,
          requestingDepartmentId: requestingDeptId,
          performingDepartmentId: performingDeptId,
          fundingType: "company-funded",
          requestingLocationType: "domestic",
          performingLocationType: "domestic",
          requestingProgramManager: "Dana Ferris",
          requestingFinanceApprover: "Kim Osei",
          performingProgramManager: "Lior Amsel",
          performingFinanceApprover: "Priya Nandan",
        },
      );
      service.addResource({ participantId: submitter }, draft.id, { budgetHours: 40, laborRate: 85.5 });
      return service.initiateDraft({ participantId: submitter }, draft.id, at(0));
    }

    // Authorization 1: a clean happy path - no correction, no hold, every
    // stage a first-pass occurrence. Both gates skip (company-funded,
    // domestic on both sides), so they contribute zero-length visits.
    const auth1 = initiateAuthorization("Clean happy path");
    service.acknowledge({ participantId: requestingApproverA }, auth1.id, at(1));
    service.acknowledge({ participantId: requestingApproverB }, auth1.id, at(2));
    service.claim({ participantId: contributorAtPerformingDept }, auth1.id, at(2));
    service.contribute(
      { participantId: contributorAtPerformingDept },
      auth1.id,
      { performingEmployee: "Priya Solanki", ...at(3) },
    );
    service.acknowledge({ participantId: performingApproverA }, auth1.id, at(4));
    service.acknowledge({ participantId: performingApproverA }, auth1.id, at(5));
    service.mintChargeNumber({ participantId: "p-elin-vasquez" }, auth1.id, { chargeNumber: "CN-1", ...at(8) });

    // Authorization 2: a correction that intersects nothing beyond its own
    // stage (`performing-finance` depends only on `resources`), plus a hold
    // that overlaps the same stage's clock - the worked example BDR-0006
    // gives for "what M2 can and cannot say," built directly rather than
    // quoted.
    const auth2 = initiateAuthorization("Correction on its own stage, and a hold");
    service.acknowledge({ participantId: requestingApproverA }, auth2.id, at(1));
    service.acknowledge({ participantId: requestingApproverB }, auth2.id, at(2));
    service.claim({ participantId: contributorAtPerformingDept }, auth2.id, at(2));
    service.contribute(
      { participantId: contributorAtPerformingDept },
      auth2.id,
      { performingEmployee: "Priya Solanki", ...at(3) },
    );
    service.acknowledge({ participantId: performingApproverA }, auth2.id, at(4)); // -> performing-finance
    service.requestCorrection({ participantId: performingApproverA }, auth2.id, {
      fields: ["resources"],
      comment: "Budget hours look understated - please revise.",
      ...at(4.5),
    });
    service.correct({ participantId: submitter }, auth2.id, {
      resources: [{ budgetHours: 60, laborRate: 90 }],
      ...at(6),
    });
    service.hold({ participantId: submitter }, auth2.id, at(6.2));
    service.release({ participantId: submitter }, auth2.id, at(7));
    service.acknowledge({ participantId: performingApproverA }, auth2.id, at(8));
    service.mintChargeNumber({ participantId: "p-elin-vasquez" }, auth2.id, { chargeNumber: "CN-2", ...at(11) });

    // Authorization 3: a correction raised at performing-program-manager
    // naming "project," which is also requesting-program-manager's own
    // declared dependency - reaching back and re-reviewing it (#60,
    // ADR-0005). Once the re-review clears, forward progression finds
    // performing-program-manager's own first visit was never resolved and
    // resumes it as a documented fresh arrival
    // (`authorizations/index.ts`'s `arriveAndSkipGates`), not as a second
    // re-review - the case `foldCorrectionHistory`'s attribution has to
    // survive.
    const auth3 = initiateAuthorization("Correction reaches back to an earlier stage");
    service.acknowledge({ participantId: requestingApproverA }, auth3.id, at(1));
    service.acknowledge({ participantId: requestingApproverB }, auth3.id, at(2));
    service.claim({ participantId: contributorAtPerformingDept }, auth3.id, at(2));
    service.contribute(
      { participantId: contributorAtPerformingDept },
      auth3.id,
      { performingEmployee: "Priya Solanki", ...at(3) },
    ); // -> performing-program-manager
    service.requestCorrection({ participantId: performingApproverA }, auth3.id, {
      fields: ["project"],
      comment: "Project name looks wrong - please confirm.",
      ...at(3.5),
    });
    service.correct({ participantId: submitter }, auth3.id, { project: "Renamed Project", ...at(5) });
    service.acknowledge({ participantId: requestingApproverA }, auth3.id, at(6)); // requesting-program-manager, re-review
    service.acknowledge({ participantId: performingApproverA }, auth3.id, at(7)); // performing-program-manager, fresh arrival
    service.acknowledge({ participantId: performingApproverA }, auth3.id, at(8));
    service.mintChargeNumber({ participantId: "p-elin-vasquez" }, auth3.id, { chargeNumber: "CN-3", ...at(10) });

    // Authorization 4: withdrawn before completion, with a referral along
    // the way - never counted anywhere (BDR-0011), and never completed, so
    // M1 and M2 must not see it while M3's denominator does (its own name
    // carries no "completed" qualifier, unlike M1's).
    const auth4 = initiateAuthorization("Withdrawn, with a referral");
    service.acknowledge({ participantId: requestingApproverA }, auth4.id, at(1));
    service.refer({ participantId: requestingApproverB }, auth4.id, {
      colleagueId: requestingApproverA,
      ...at(1.5),
    });
    service.withdraw({ participantId: submitter }, auth4.id, at(2));
  });
  after(() => {
    service.close();
    store.cleanup();
  });

  test("M1: the share of completed authorizations with zero correction requests", () => {
    const { m1ZeroCorrectionShare } = service.getMeasures(SYSTEM);
    assert.equal(m1ZeroCorrectionShare.completedCount, 3);
    assert.equal(m1ZeroCorrectionShare.zeroCorrectionCount, 1);
    assert.equal(m1ZeroCorrectionShare.share, 1 / 3);
  });

  test("M2: average cycle time from initiation to completion, held time excluded", () => {
    const { m2CycleTime } = service.getMeasures(SYSTEM);
    assert.equal(m2CycleTime.completedCount, 3);
    // 8h + (11h - 0.8h held) + 10h, averaged over 3 completed authorizations.
    const expectedAverageMs = ((8 + 10.2 + 10) / 3) * HOUR;
    assert.ok(
      Math.abs(m2CycleTime.averageMs! - expectedAverageMs) < 1,
      `expected ~${expectedAverageMs}ms, got ${m2CycleTime.averageMs}`,
    );
  });

  test("M3: correction requests per authorization, over every authorization initiated - not only completed ones", () => {
    const { m3CorrectionsPerAuthorization } = service.getMeasures(SYSTEM);
    // One correction request each from authorizations 2 and 3; none from 1
    // or the withdrawn authorization 4 - which still counts in the
    // denominator.
    assert.equal(m3CorrectionsPerAuthorization.authorizationCount, 4);
    assert.equal(m3CorrectionsPerAuthorization.totalCorrectionRequests, 2);
    assert.equal(m3CorrectionsPerAuthorization.average, 0.5);
  });

  test("held time is reported separately from every other figure", () => {
    const { heldTime } = service.getMeasures(SYSTEM);
    assert.equal(heldTime.authorizationCount, 1);
    assert.equal(heldTime.totalMs, 0.8 * HOUR);
  });

  test("a stage re-entered as a re-review is a separate occurrence from its first pass", () => {
    const { stageOccurrences } = service.getMeasures(SYSTEM);
    const firstPass = stageOccurrences.find(
      (row) => row.stageId === "requesting-program-manager" && row.occurrence === "first-pass",
    )!;
    const reReview = stageOccurrences.find(
      (row) => row.stageId === "requesting-program-manager" && row.occurrence === "re-review",
    )!;

    // Every one of the four authorizations passes through
    // requesting-program-manager once as a first arrival; only
    // authorization 3's correction sends it back a second time.
    assert.equal(firstPass.visitCount, 4);
    assert.equal(firstPass.approverMs, 4 * HOUR);
    assert.equal(reReview.visitCount, 1);
    assert.equal(reReview.approverMs, 1 * HOUR);
  });

  test("awaiting-correction time is attributed to the stage that raised it, even when that stage's own visit never resolves", () => {
    const { stageOccurrences } = service.getMeasures(SYSTEM);
    const firstPass = stageOccurrences.find(
      (row) => row.stageId === "performing-program-manager" && row.occurrence === "first-pass",
    )!;

    // Authorization 3's correction was raised while performing-program-manager
    // sat at its very first (never-resolved) visit; the visit that actually
    // resolves the stage afterward is a documented fresh arrival, not that
    // same visit continuing. The 1.5h it spent awaiting correction still has
    // to land on this line rather than disappearing.
    assert.equal(firstPass.awaitingCorrectionMs, 1.5 * HOUR);
    // Three resolved visits contribute approver time: authorization 1's,
    // authorization 2's (untouched by its own correction, which named only
    // "resources"), and authorization 3's fresh-arrival resumption.
    assert.equal(firstPass.visitCount, 3);
    assert.equal(firstPass.approverMs, 3 * HOUR);
  });

  test("a stage's own clock excludes both held time and awaiting-correction time from approver time", () => {
    const { stageOccurrences } = service.getMeasures(SYSTEM);
    const firstPass = stageOccurrences.find(
      (row) => row.stageId === "performing-finance" && row.occurrence === "first-pass",
    )!;

    // Authorization 2's performing-finance visit ran 4h (h4-h8): 1.5h
    // awaiting the correction it raised against itself, 0.8h held in the
    // middle of that same span, and the rest - 1.7h - is approver time.
    // Authorizations 1 and 3 each contribute a plain 1h first-pass visit.
    assert.equal(firstPass.visitCount, 3);
    assert.equal(firstPass.awaitingCorrectionMs, 1.5 * HOUR);
    assert.equal(firstPass.approverMs, (1 + 1.7 + 1) * HOUR);
  });

  test("referrals appear nowhere in the measures, aggregate counts included", () => {
    const measures = service.getMeasures(SYSTEM);
    assert.ok(
      !JSON.stringify(measures).toLowerCase().includes("referr"),
      "expected no trace of a referral anywhere in the computed measures",
    );
    // The withdrawn authorization's referral does not inflate M3's count.
    assert.equal(measures.m3CorrectionsPerAuthorization.totalCorrectionRequests, 2);
  });

  test("no figure attributes time or defects to a named participant", () => {
    const measures = service.getMeasures(SYSTEM);
    const named = [
      submitter,
      requestingApproverA,
      requestingApproverB,
      performingApproverA,
      contributorAtPerformingDept,
    ];
    const serialized = JSON.stringify(measures);
    for (const participantId of named) {
      assert.ok(!serialized.includes(participantId), `expected no participant id "${participantId}" in the measures`);
    }
  });
});
