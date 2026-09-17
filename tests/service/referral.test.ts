import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { createService } from "../../src/service/index.ts";
import { DomainError } from "../../src/service/errors.ts";
import { withTempStore } from "../helpers/temp-store.ts";

/**
 * Referral (#62, BDR-0011): whoever holds an authorization at their stage
 * showing it to a named colleague, to ask what they cannot answer
 * themselves. Notifies and records, and does nothing else - the
 * authorization stays exactly where it is, in the referrer's queue, the
 * colleague gains no power to act on it, and the acknowledgement still comes
 * from whoever the stage actually routed to. Available to the same
 * population that could act on the authorization right now, not approvers
 * only.
 */

describe("referral", () => {
  let store: ReturnType<typeof withTempStore>;
  let service: ReturnType<typeof createService>;
  let submitter: string;
  let requestingApproverA: string;
  let requestingApproverB: string;
  let performingApproverA: string;
  let contributorAtPerformingDept: string;
  let anotherContributorAtPerformingDept: string;
  let unrelatedApprover: string;
  let chargeNumberAdmin: string;
  let requestingDeptId: string;
  let performingDeptId: string;

  before(() => {
    store = withTempStore();
    service = createService({ storePath: store.path });

    const people = service.listParticipants({ participantId: "system" });
    submitter = people.find((p) => p.id === "p-avery-lund")!.id;
    requestingApproverA = people.find((p) => p.id === "p-cate-marchetti")!.id;
    requestingApproverB = people.find((p) => p.id === "p-hugo-strand")!.id;
    performingApproverA = people.find((p) => p.id === "p-mira-devane")!.id;
    contributorAtPerformingDept = people.find((p) => p.id === "p-nils-oyelaran")!.id;
    anotherContributorAtPerformingDept = people.find((p) => p.id === "p-lena-birch")!.id;
    unrelatedApprover = people.find((p) => p.id === "p-jun-abernathy")!.id;
    chargeNumberAdmin = people.find((p) => p.id === "p-sadie-okonkwo")!.id;

    const departments = service.searchDepartments({ participantId: "system" });
    requestingDeptId = departments.find((d) => d.name === "Heat Exchange Products")!.id;
    performingDeptId = departments.find((d) => d.name === "Rotor Hubs")!.id;
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

  test("an unknown authorization id is refused", () => {
    assert.throws(
      () =>
        service.refer({ participantId: requestingApproverA }, "authorization-nope", {
          colleagueId: unrelatedApprover,
        }),
      (err: unknown) => err instanceof DomainError && err.code === "UNKNOWN_AUTHORIZATION",
    );
  });

  test("only whoever holds the authorization at its stage may refer it", () => {
    const authorization = initiateAuthorization("Only the holder refers");
    assert.throws(
      () =>
        service.refer({ participantId: unrelatedApprover }, authorization.id, {
          colleagueId: performingApproverA,
        }),
      (err: unknown) => err instanceof DomainError && err.code === "NOT_IN_QUEUE",
    );
    // Owning the authorization is not the same as holding its current stage.
    assert.throws(
      () => service.refer({ participantId: submitter }, authorization.id, { colleagueId: performingApproverA }),
      (err: unknown) => err instanceof DomainError && err.code === "NOT_IN_QUEUE",
    );
  });

  test("an approver at the current stage may refer it, and every referral is readable in the authorization's history", () => {
    const authorization = initiateAuthorization("Referral is recorded");
    const referred = service.refer({ participantId: requestingApproverA }, authorization.id, {
      colleagueId: unrelatedApprover,
    });
    assert.equal(referred.referrals.length, 1);
    assert.equal(referred.referrals[0]!.colleagueId, unrelatedApprover);
    assert.equal(referred.referrals[0]!.referredBy, requestingApproverA);
    assert.ok(referred.referrals[0]!.referredAt);
  });

  test("a referral moves nothing - the authorization stays exactly where it is, in the referrer's queue", () => {
    const authorization = initiateAuthorization("Referral moves nothing");
    const referred = service.refer({ participantId: requestingApproverA }, authorization.id, {
      colleagueId: unrelatedApprover,
    });
    assert.equal(referred.currentStageId, authorization.currentStageId);
    assert.ok(service.listMyQueue({ participantId: requestingApproverA }).some((a) => a.id === authorization.id));
  });

  test("the colleague gains no power to act on it, and the acknowledgement still comes from whoever the stage routed to", () => {
    const authorization = initiateAuthorization("Colleague gains no power");
    service.refer({ participantId: requestingApproverA }, authorization.id, { colleagueId: unrelatedApprover });

    assert.throws(
      () => service.acknowledge({ participantId: unrelatedApprover }, authorization.id),
      (err: unknown) => err instanceof DomainError && err.code === "NOT_IN_QUEUE",
    );

    const acknowledged = service.acknowledge({ participantId: requestingApproverA }, authorization.id);
    assert.equal(acknowledged.currentStageId, "requesting-finance");
  });

  test("a referral may recur, and every one is kept in order", () => {
    const authorization = initiateAuthorization("Multiple referrals");
    service.refer({ participantId: requestingApproverA }, authorization.id, { colleagueId: unrelatedApprover });
    const twice = service.refer({ participantId: requestingApproverA }, authorization.id, {
      colleagueId: chargeNumberAdmin,
    });
    assert.equal(twice.referrals.length, 2);
    assert.deepEqual(
      twice.referrals.map((r) => r.colleagueId),
      [unrelatedApprover, chargeNumberAdmin],
    );
  });

  test("a held authorization may not be referred", () => {
    const authorization = initiateAuthorization("Held authorizations cannot be referred");
    service.hold({ participantId: submitter }, authorization.id);
    assert.throws(
      () =>
        service.refer({ participantId: requestingApproverA }, authorization.id, {
          colleagueId: unrelatedApprover,
        }),
      (err: unknown) => err instanceof DomainError && err.code === "NOT_IN_QUEUE",
    );
  });

  test("while awaiting correction, the corrector may refer it - the approver who raised the request no longer holds it", () => {
    const authorization = initiateAuthorization("Correction owner refers");
    service.requestCorrection({ participantId: requestingApproverA }, authorization.id, {
      fields: ["project"],
      comment: "Wrong project name.",
    });

    assert.throws(
      () =>
        service.refer({ participantId: requestingApproverA }, authorization.id, {
          colleagueId: unrelatedApprover,
        }),
      (err: unknown) => err instanceof DomainError && err.code === "NOT_IN_QUEUE",
    );

    const referred = service.refer({ participantId: submitter }, authorization.id, {
      colleagueId: unrelatedApprover,
    });
    assert.equal(referred.referrals.length, 1);
  });

  test("at the performing-department stage, any contributor there may refer an unclaimed authorization, but only the claimant may once it is claimed", () => {
    const authorization = initiateAuthorization("Contribution-stage referral");
    service.acknowledge({ participantId: requestingApproverA }, authorization.id);
    service.acknowledge({ participantId: requestingApproverB }, authorization.id);

    const referredUnclaimed = service.refer(
      { participantId: anotherContributorAtPerformingDept },
      authorization.id,
      { colleagueId: unrelatedApprover },
    );
    assert.equal(referredUnclaimed.referrals.length, 1);

    service.claim({ participantId: contributorAtPerformingDept }, authorization.id);

    assert.throws(
      () =>
        service.refer({ participantId: anotherContributorAtPerformingDept }, authorization.id, {
          colleagueId: unrelatedApprover,
        }),
      (err: unknown) => err instanceof DomainError && err.code === "NOT_IN_QUEUE",
    );

    const referredClaimed = service.refer({ participantId: contributorAtPerformingDept }, authorization.id, {
      colleagueId: unrelatedApprover,
    });
    assert.equal(referredClaimed.referrals.length, 2);
  });

  test("the charge number admin may refer at the mint stage", () => {
    const authorization = reachMintStage("Mint-stage referral");
    const referred = service.refer({ participantId: chargeNumberAdmin }, authorization.id, {
      colleagueId: unrelatedApprover,
    });
    assert.equal(referred.referrals.length, 1);
  });

  test("a completed authorization may not be referred", () => {
    const authorization = reachMintStage("Completed authorizations cannot be referred");
    service.mintChargeNumber({ participantId: chargeNumberAdmin }, authorization.id, { chargeNumber: "CN-62-1" });
    assert.throws(
      () =>
        service.refer({ participantId: chargeNumberAdmin }, authorization.id, {
          colleagueId: unrelatedApprover,
        }),
      (err: unknown) => err instanceof DomainError && err.code === "NOT_IN_QUEUE",
    );
  });

  test("a referral may not name the referrer themselves", () => {
    const authorization = initiateAuthorization("No self-referral");
    assert.throws(
      () =>
        service.refer({ participantId: requestingApproverA }, authorization.id, {
          colleagueId: requestingApproverA,
        }),
      (err: unknown) => err instanceof DomainError && err.code === "INVALID_REQUEST",
    );
  });

  test("a referral may not name the system identity", () => {
    const authorization = initiateAuthorization("No referring to the system");
    assert.throws(
      () => service.refer({ participantId: requestingApproverA }, authorization.id, { colleagueId: "system" }),
      (err: unknown) => err instanceof DomainError && err.code === "INVALID_REQUEST",
    );
  });

  test("a referral must name a real, known participant", () => {
    const authorization = initiateAuthorization("Unknown colleague refused");
    assert.throws(
      () =>
        service.refer({ participantId: requestingApproverA }, authorization.id, {
          colleagueId: "p-does-not-exist",
        }),
      (err: unknown) => err instanceof DomainError && err.code === "UNKNOWN_PARTICIPANT",
    );
  });
});
