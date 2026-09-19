import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { createService } from "../../src/service/index.ts";
import { DomainError } from "../../src/service/errors.ts";
import { withTempStore } from "../helpers/temp-store.ts";

/**
 * Hold, release and withdraw (#61): the submitter's two powers over an
 * authorization they raised. A hold pauses it - it leaves every queue and
 * resumes at exactly the stage it left, with the paused span recorded so a
 * later measure can exclude it from cycle time and report it separately
 * (BDR-0006). A withdrawal ends it terminally, freezing its classification
 * like any other terminal transition (ADR-0007) and distinguishable in the
 * record from a future revocation (#64) by both its transition kind and its
 * actor - the submitter, never the system.
 */

describe("hold, release and withdraw", () => {
  let store: ReturnType<typeof withTempStore>;
  let service: ReturnType<typeof createService>;
  let submitter: string;
  let anotherSubmitter: string;
  let requestingApproverA: string;
  let requestingApproverB: string;
  let performingApproverA: string;
  let contributorAtPerformingDept: string;
  let chargeNumberAdmin: string;
  let requestingDeptId: string;
  let performingDeptId: string;

  before(() => {
    store = withTempStore();
    service = createService({ storePath: store.path });

    const people = service.listParticipants({ participantId: "system" });
    submitter = people.find((p) => p.id === "p-teo-brandt")!.id;
    anotherSubmitter = people.find((p) => p.id === "p-elin-vasquez")!.id;
    // Deliberately the same person: the demo roster (#92) seeds one Approver
    // per department, and nothing here needs the two requesting-side stages
    // acknowledged by different people.
    requestingApproverA = people.find((p) => p.id === "p-priya-anand")!.id;
    requestingApproverB = people.find((p) => p.id === "p-priya-anand")!.id;
    performingApproverA = people.find((p) => p.id === "p-marcus-oduya")!.id;
    contributorAtPerformingDept = people.find((p) => p.id === "p-jordan-hale")!.id;
    chargeNumberAdmin = people.find((p) => p.id === "p-elin-vasquez")!.id;

    const departments = service.searchDepartments({ participantId: "system" });
    requestingDeptId = departments.find((d) => d.name === "Rotor Assemblies")!.id;
    performingDeptId = departments.find((d) => d.name === "Flight Controls Software")!.id;
  });
  after(() => {
    service.close();
    store.cleanup();
  });

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
    return service.initiateDraft({ participantId: submitter }, draft.id);
  }

  function reachMintStage(project: string) {
    const authorization = initiateAuthorization(project);
    service.acknowledge({ participantId: requestingApproverA }, authorization.id); // -> requesting-finance
    service.acknowledge({ participantId: requestingApproverB }, authorization.id); // -> performing-department
    service.claim({ participantId: contributorAtPerformingDept }, authorization.id);
    service.contribute({ participantId: contributorAtPerformingDept }, authorization.id, {
      performingEmployee: "Jade Okafor",
    });
    service.acknowledge({ participantId: performingApproverA }, authorization.id); // -> performing-finance
    return service.acknowledge({ participantId: performingApproverA }, authorization.id); // -> charge-number-admin
  }

  function rawTransitions(authorizationId: string): { kind: string; actor_id: string; payload: string }[] {
    const raw = new DatabaseSync(store.path);
    try {
      return raw
        .prepare("SELECT kind, actor_id, payload FROM transitions WHERE authorization_id = ? ORDER BY seq")
        .all(authorizationId) as { kind: string; actor_id: string; payload: string }[];
    } finally {
      raw.close();
    }
  }

  test("an unknown authorization id is refused on hold, release and withdraw", () => {
    for (const action of ["hold", "release", "withdraw"] as const) {
      assert.throws(
        () => service[action]({ participantId: submitter }, "authorization-nope"),
        (err: unknown) => err instanceof DomainError && err.code === "UNKNOWN_AUTHORIZATION",
      );
    }
  });

  test("only the submitter may hold", () => {
    const authorization = initiateAuthorization("Only the submitter holds");
    assert.throws(
      () => service.hold({ participantId: anotherSubmitter }, authorization.id),
      (err: unknown) => err instanceof DomainError && err.code === "NOT_SUBMITTER",
    );
    assert.throws(
      () => service.hold({ participantId: requestingApproverA }, authorization.id),
      (err: unknown) => err instanceof DomainError && err.code === "NOT_SUBMITTER",
    );
  });

  test("only the submitter may release", () => {
    const authorization = initiateAuthorization("Only the submitter releases");
    service.hold({ participantId: submitter }, authorization.id);
    assert.throws(
      () => service.release({ participantId: anotherSubmitter }, authorization.id),
      (err: unknown) => err instanceof DomainError && err.code === "NOT_SUBMITTER",
    );
  });

  test("holding removes an authorization from nobody's-queue - it disappears from the approver's queue at its current stage", () => {
    const authorization = initiateAuthorization("Held authorizations leave every queue");
    assert.ok(service.listMyQueue({ participantId: requestingApproverA }).some((a) => a.id === authorization.id));

    const held = service.hold({ participantId: submitter }, authorization.id);
    assert.equal(held.onHold, true);
    assert.ok(!service.listMyQueue({ participantId: requestingApproverA }).some((a) => a.id === authorization.id));
  });

  test("releasing resumes an authorization at exactly the stage it left", () => {
    const authorization = initiateAuthorization("Release resumes where it left off");
    service.hold({ participantId: submitter }, authorization.id);

    const released = service.release({ participantId: submitter }, authorization.id);
    assert.equal(released.onHold, false);
    assert.equal(released.currentStageId, authorization.currentStageId);
    assert.ok(service.listMyQueue({ participantId: requestingApproverA }).some((a) => a.id === authorization.id));
  });

  test("an authorization may not be held twice", () => {
    const authorization = initiateAuthorization("No double hold");
    service.hold({ participantId: submitter }, authorization.id);
    assert.throws(
      () => service.hold({ participantId: submitter }, authorization.id),
      (err: unknown) => err instanceof DomainError && err.code === "ALREADY_ON_HOLD",
    );
  });

  test("an authorization that is not on hold may not be released", () => {
    const authorization = initiateAuthorization("No release without a hold");
    assert.throws(
      () => service.release({ participantId: submitter }, authorization.id),
      (err: unknown) => err instanceof DomainError && err.code === "NOT_ON_HOLD",
    );
  });

  test("held time is recorded as spans, one per hold/release cycle, so it can be excluded from cycle time and reported separately", () => {
    const authorization = initiateAuthorization("Held spans are recorded");
    service.hold({ participantId: submitter }, authorization.id);
    const stillHeld = service.release({ participantId: submitter }, authorization.id);
    assert.equal(stillHeld.holdIntervals.length, 1);
    assert.ok(stillHeld.holdIntervals[0]!.heldAt);
    assert.ok(stillHeld.holdIntervals[0]!.releasedAt);

    service.hold({ participantId: submitter }, authorization.id);
    const heldAgain = service.getAuthorization({ participantId: submitter }, authorization.id);
    assert.equal(heldAgain.holdIntervals.length, 2);
    assert.equal(heldAgain.holdIntervals[1]!.releasedAt, null);
    assert.equal(heldAgain.onHold, true);
  });

  test("holding takes an authorization out of the correction queue it would otherwise sit in", () => {
    const authorization = initiateAuthorization("Held while awaiting correction");
    const awaitingCorrection = service.requestCorrection(
      { participantId: requestingApproverA },
      authorization.id,
      { fields: ["project"], comment: "Wrong project name." },
    );
    assert.equal(awaitingCorrection.awaitingCorrection, true);
    assert.ok(service.listMyQueue({ participantId: submitter }).some((a) => a.id === authorization.id));

    service.hold({ participantId: submitter }, authorization.id);
    assert.ok(!service.listMyQueue({ participantId: submitter }).some((a) => a.id === authorization.id));
  });

  test("a completed authorization may not be held, released or withdrawn", () => {
    const authorization = reachMintStage("No holding a completed authorization");
    service.mintChargeNumber({ participantId: chargeNumberAdmin }, authorization.id, { chargeNumber: "CN-61-1" });

    for (const action of ["hold", "release", "withdraw"] as const) {
      assert.throws(
        () => service[action]({ participantId: submitter }, authorization.id),
        (err: unknown) => err instanceof DomainError && err.code === "AUTHORIZATION_TERMINAL",
      );
    }
  });

  test("only the submitter may withdraw", () => {
    const authorization = initiateAuthorization("Only the submitter withdraws");
    assert.throws(
      () => service.withdraw({ participantId: anotherSubmitter }, authorization.id),
      (err: unknown) => err instanceof DomainError && err.code === "NOT_SUBMITTER",
    );
    assert.throws(
      () => service.withdraw({ participantId: requestingApproverA }, authorization.id),
      (err: unknown) => err instanceof DomainError && err.code === "NOT_SUBMITTER",
    );
  });

  test("withdrawing ends an authorization terminally, wherever it sits, and it leaves the record permanently", () => {
    const authorization = initiateAuthorization("Withdrawal is terminal");
    assert.ok(service.listMyQueue({ participantId: requestingApproverA }).some((a) => a.id === authorization.id));

    const withdrawn = service.withdraw({ participantId: submitter }, authorization.id);
    assert.notEqual(withdrawn.withdrawnAt, null);
    assert.equal(withdrawn.chargeNumber, null);
    assert.ok(!service.listMyQueue({ participantId: requestingApproverA }).some((a) => a.id === authorization.id));
  });

  test("withdrawing freezes the classification for both sides, the same way completion does", () => {
    const authorization = initiateAuthorization("Withdrawal freezes classification");
    const requesting = service.getDepartment({ participantId: submitter }, requestingDeptId);
    const performing = service.getDepartment({ participantId: submitter }, performingDeptId);

    const withdrawn = service.withdraw({ participantId: submitter }, authorization.id);

    assert.ok(withdrawn.classification);
    assert.deepEqual(withdrawn.classification!.requesting, {
      department: { id: requesting.id, name: requesting.name },
      division: { id: requesting.division.id, name: requesting.division.name },
      legalEntity: { id: requesting.legalEntity.id, name: requesting.legalEntity.name },
    });
    assert.deepEqual(withdrawn.classification!.performing, {
      department: { id: performing.id, name: performing.name },
      division: { id: performing.division.id, name: performing.division.name },
      legalEntity: { id: performing.legalEntity.id, name: performing.legalEntity.name },
    });

    const readBack = service.getClassification({ participantId: submitter }, authorization.id);
    assert.deepEqual(readBack, withdrawn.classification);
  });

  test("an already-withdrawn authorization may not be withdrawn again", () => {
    const authorization = initiateAuthorization("No double withdrawal");
    service.withdraw({ participantId: submitter }, authorization.id);
    assert.throws(
      () => service.withdraw({ participantId: submitter }, authorization.id),
      (err: unknown) => err instanceof DomainError && err.code === "AUTHORIZATION_TERMINAL",
    );
  });

  test("withdrawal works whether an authorization is on hold or moving normally", () => {
    const authorization = initiateAuthorization("Withdraw while held");
    service.hold({ participantId: submitter }, authorization.id);

    const withdrawn = service.withdraw({ participantId: submitter }, authorization.id);
    assert.notEqual(withdrawn.withdrawnAt, null);

    // Terminal now, even though the hold itself was never released - a
    // withdrawal ends it wherever it sits, and nothing may act on it again.
    assert.throws(
      () => service.release({ participantId: submitter }, authorization.id),
      (err: unknown) => err instanceof DomainError && err.code === "AUTHORIZATION_TERMINAL",
    );
  });

  test("withdrawn is distinguishable from a future revocation: the transition kind and its actor say which happened", () => {
    const authorization = initiateAuthorization("Withdrawn, not revoked");
    service.withdraw({ participantId: submitter }, authorization.id);

    const transitions = rawTransitions(authorization.id);
    const withdrawals = transitions.filter((row) => row.kind === "withdrawal");
    assert.equal(withdrawals.length, 1);
    // The submitter caused it - a revocation (#64) is always caused by the
    // system, since no approver revokes anything and an Administrator's
    // hierarchy edit is what triggers one (CONTEXT.md: "Revocation").
    assert.equal(withdrawals[0]!.actor_id, submitter);
    assert.equal(
      transitions.some((row) => row.kind === "revocation"),
      false,
    );
  });

  test("a held authorization refuses acknowledgement, claim and mint even when called directly, not only when read from a queue", () => {
    const requestingAuthorization = initiateAuthorization("Held, acknowledgement refused directly");
    service.hold({ participantId: submitter }, requestingAuthorization.id);
    assert.throws(
      () => service.acknowledge({ participantId: requestingApproverA }, requestingAuthorization.id),
      (err: unknown) => err instanceof DomainError && err.code === "NOT_IN_QUEUE",
    );

    const claimAuthorization = initiateAuthorization("Held, claim refused directly");
    service.acknowledge({ participantId: requestingApproverA }, claimAuthorization.id);
    service.acknowledge({ participantId: requestingApproverB }, claimAuthorization.id); // -> performing-department
    service.hold({ participantId: submitter }, claimAuthorization.id);
    assert.throws(
      () => service.claim({ participantId: contributorAtPerformingDept }, claimAuthorization.id),
      (err: unknown) => err instanceof DomainError && err.code === "NOT_IN_QUEUE",
    );

    const mintAuthorization = reachMintStage("Held, mint refused directly");
    service.hold({ participantId: submitter }, mintAuthorization.id);
    assert.throws(
      () => service.mintChargeNumber({ participantId: chargeNumberAdmin }, mintAuthorization.id, { chargeNumber: "CN-61-2" }),
      (err: unknown) => err instanceof DomainError && err.code === "NOT_IN_QUEUE",
    );
  });

  test("a held authorization refuses a contribution and a correction's fulfillment, called directly", () => {
    const contributeAuthorization = initiateAuthorization("Held, contribution refused directly");
    service.acknowledge({ participantId: requestingApproverA }, contributeAuthorization.id);
    service.acknowledge({ participantId: requestingApproverB }, contributeAuthorization.id); // -> performing-department
    service.claim({ participantId: contributorAtPerformingDept }, contributeAuthorization.id);
    service.hold({ participantId: submitter }, contributeAuthorization.id);
    assert.throws(
      () =>
        service.contribute({ participantId: contributorAtPerformingDept }, contributeAuthorization.id, {
          performingEmployee: "Jade Okafor",
        }),
      (err: unknown) => err instanceof DomainError && err.code === "AUTHORIZATION_ON_HOLD",
    );

    const correctionAuthorization = initiateAuthorization("Held, correction refused directly");
    service.requestCorrection({ participantId: requestingApproverA }, correctionAuthorization.id, {
      fields: ["project"],
      comment: "Wrong project name.",
    });
    service.hold({ participantId: submitter }, correctionAuthorization.id);
    assert.throws(
      () => service.correct({ participantId: submitter }, correctionAuthorization.id, { project: "Corrected name" }),
      (err: unknown) => err instanceof DomainError && err.code === "AUTHORIZATION_ON_HOLD",
    );
  });

  // #84: withdrawal is terminal "wherever it happens to sit" - mid-relay,
  // at an ordinary acknowledgeable stage, exactly like the one place
  // `requireNotTerminal` was already proven (hold/release/withdraw above).
  // Nothing about `currentStageId` or a queue's own membership check moves
  // when a withdrawal is appended, so these seven commands only refuse a
  // withdrawn authorization because each now calls `requireNotTerminal`
  // itself, not because the queue functions they call afterward noticed
  // anything was wrong.
  test("a withdrawn authorization refuses acknowledgement, claim, mint and referral, called directly, mid-relay", () => {
    const acknowledgeAuthorization = initiateAuthorization("Withdrawn mid-relay, acknowledge refused directly");
    service.withdraw({ participantId: submitter }, acknowledgeAuthorization.id);
    assert.throws(
      () => service.acknowledge({ participantId: requestingApproverA }, acknowledgeAuthorization.id),
      (err: unknown) => err instanceof DomainError && err.code === "AUTHORIZATION_TERMINAL",
    );
    // The same authorization: `requestingApproverA` held its queue right up
    // until the withdrawal, so a referral attempt exercises the same guard
    // rather than failing for the unrelated reason of never having held it.
    assert.throws(
      () =>
        service.refer({ participantId: requestingApproverA }, acknowledgeAuthorization.id, {
          colleagueId: chargeNumberAdmin,
        }),
      (err: unknown) => err instanceof DomainError && err.code === "AUTHORIZATION_TERMINAL",
    );

    const claimAuthorization = initiateAuthorization("Withdrawn mid-relay, claim refused directly");
    service.acknowledge({ participantId: requestingApproverA }, claimAuthorization.id);
    service.acknowledge({ participantId: requestingApproverB }, claimAuthorization.id); // -> performing-department
    service.withdraw({ participantId: submitter }, claimAuthorization.id);
    assert.throws(
      () => service.claim({ participantId: contributorAtPerformingDept }, claimAuthorization.id),
      (err: unknown) => err instanceof DomainError && err.code === "AUTHORIZATION_TERMINAL",
    );

    const mintAuthorization = reachMintStage("Withdrawn mid-relay, mint refused directly");
    service.withdraw({ participantId: submitter }, mintAuthorization.id);
    assert.throws(
      () =>
        service.mintChargeNumber({ participantId: chargeNumberAdmin }, mintAuthorization.id, {
          chargeNumber: "CN-84-1",
        }),
      (err: unknown) => err instanceof DomainError && err.code === "AUTHORIZATION_TERMINAL",
    );
  });

  test("a withdrawn authorization refuses a contribution, a correction request and a correction's fulfillment, called directly, mid-relay", () => {
    const contributeAuthorization = initiateAuthorization("Withdrawn mid-relay, contribution refused directly");
    service.acknowledge({ participantId: requestingApproverA }, contributeAuthorization.id);
    service.acknowledge({ participantId: requestingApproverB }, contributeAuthorization.id); // -> performing-department
    service.claim({ participantId: contributorAtPerformingDept }, contributeAuthorization.id);
    service.withdraw({ participantId: submitter }, contributeAuthorization.id);
    assert.throws(
      () =>
        service.contribute({ participantId: contributorAtPerformingDept }, contributeAuthorization.id, {
          performingEmployee: "Jade Okafor",
        }),
      (err: unknown) => err instanceof DomainError && err.code === "AUTHORIZATION_TERMINAL",
    );

    const requestCorrectionAuthorization = initiateAuthorization(
      "Withdrawn mid-relay, correction request refused directly",
    );
    service.withdraw({ participantId: submitter }, requestCorrectionAuthorization.id);
    assert.throws(
      () =>
        service.requestCorrection({ participantId: requestingApproverA }, requestCorrectionAuthorization.id, {
          fields: ["project"],
          comment: "Too late.",
        }),
      (err: unknown) => err instanceof DomainError && err.code === "AUTHORIZATION_TERMINAL",
    );

    // Withdrawal is reachable even while a correction sits outstanding
    // (`withdraw` checks only `isTerminal`, never `awaitingCorrection`) -
    // so the fulfillment side of the same gap is reachable too, unless
    // `correct` refuses it just as directly.
    const correctAuthorization = initiateAuthorization("Withdrawn mid-relay, correction fulfillment refused directly");
    service.requestCorrection({ participantId: requestingApproverA }, correctAuthorization.id, {
      fields: ["project"],
      comment: "Wrong project name.",
    });
    service.withdraw({ participantId: submitter }, correctAuthorization.id);
    assert.throws(
      () => service.correct({ participantId: submitter }, correctAuthorization.id, { project: "Corrected name" }),
      (err: unknown) => err instanceof DomainError && err.code === "AUTHORIZATION_TERMINAL",
    );
  });
});
