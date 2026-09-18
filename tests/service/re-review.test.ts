import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { createService } from "../../src/service/index.ts";
import { RELAY_CONFIG } from "../../src/relay/config.ts";
import { appendConfigurationChangeReReviewTransition } from "../../src/authorizations/index.ts";
import { withTempStore, addTestParticipant } from "../helpers/temp-store.ts";

/**
 * Re-review, both causes, one mechanism (#60, ADR-0004, ADR-0005): an
 * approver seeing something they already acted on, told which of the two
 * things moved beneath them - a correction changing a field their stage
 * depends on, or the relay's configuration changing beneath the
 * authorization. Each stage declares its dependencies in the relay
 * configuration (`relay/config.ts`); a correction re-enters every passed
 * stage the changed fields intersect, in relay order, and disturbs nobody
 * else - a stage with no dependencies survives every correction, exactly as
 * ADR-0005 describes.
 *
 * The configuration-change cause has no live editor by design (#60's own
 * acceptance criteria), so its tests call
 * `appendConfigurationChangeReReviewTransition` directly against a raw
 * connection to the same store, bypassing `service` the way nothing else in
 * this suite needs to - the seeded scenario a migration would eventually
 * trigger.
 *
 * The fixture departments are the same ones `correction.test.ts` and
 * `completion.test.ts` already use: "Rotor Assemblies" (requesting) and
 * "Flight Controls Software" (performing). The demo roster (#92) seeds no
 * gate Approvers at all, so Contracts and Global Trade's Approvers are added
 * directly to this test's own store (`addTestParticipant`), the same way
 * `gates.test.ts` does. A correction is always supplied by the submitter
 * (BDR-0005: "the submitter corrects it, generally") - only
 * `performingEmployee` belongs to the performing contributor, and this suite
 * never corrects that field.
 */

describe("re-review, both causes, one mechanism", () => {
  let store: ReturnType<typeof withTempStore>;
  let service: ReturnType<typeof createService>;
  let submitter: string;
  let requestingApproverA: string;
  let requestingApproverB: string;
  let performingApproverA: string;
  let contributorAtPerformingDept: string;
  let contractsApprover: string;
  let globalTradeApprover: string;
  let requestingDeptId: string;
  let performingDeptId: string;

  before(() => {
    store = withTempStore();
    service = createService({ storePath: store.path });
    addTestParticipant(store.path, {
      id: "p-test-contracts-approver",
      name: "Test Contracts Approver",
      role: "Approver",
      department: "Contracts",
    });
    addTestParticipant(store.path, {
      id: "p-test-global-trade-approver",
      name: "Test Global Trade Approver",
      role: "Approver",
      department: "Global Trade",
    });

    const people = service.listParticipants({ participantId: "system" });
    submitter = people.find((p) => p.id === "p-teo-brandt")!.id;
    requestingApproverA = people.find((p) => p.id === "p-priya-anand")!.id;
    requestingApproverB = people.find((p) => p.id === "p-priya-anand")!.id;
    performingApproverA = people.find((p) => p.id === "p-marcus-oduya")!.id;
    contributorAtPerformingDept = people.find((p) => p.id === "p-jordan-hale")!.id;
    contractsApprover = people.find((p) => p.id === "p-test-contracts-approver")!.id;
    globalTradeApprover = people.find((p) => p.id === "p-test-global-trade-approver")!.id;

    const departments = service.searchDepartments({ participantId: "system" });
    requestingDeptId = departments.find((d) => d.name === "Rotor Assemblies")!.id;
    performingDeptId = departments.find((d) => d.name === "Flight Controls Software")!.id;
  });
  after(() => {
    service.close();
    store.cleanup();
  });

  function initiateAuthorization(project: string, overrides: Record<string, unknown> = {}) {
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
        ...overrides,
      },
    );
    service.addResource({ participantId: submitter }, draft.id, { budgetHours: 40, laborRate: 85.5 });
    return service.initiateDraft({ participantId: submitter }, draft.id);
  }

  /** Walks the authorization to performing-finance - every stage before it
   *  resolved, nothing beyond it touched yet. The last stage that can still
   *  raise a correction request before the two (skippable, here) gates and
   *  the mint stage, which cannot. */
  function reachPerformingFinance(project: string, overrides: Record<string, unknown> = {}) {
    const authorization = initiateAuthorization(project, overrides);
    service.acknowledge({ participantId: requestingApproverA }, authorization.id); // -> requesting-finance
    service.acknowledge({ participantId: requestingApproverB }, authorization.id); // -> performing-department
    service.claim({ participantId: contributorAtPerformingDept }, authorization.id);
    service.contribute({ participantId: contributorAtPerformingDept }, authorization.id, {
      performingEmployee: "Jade Okafor",
    }); // -> performing-program-manager
    return service.acknowledge({ participantId: performingApproverA }, authorization.id); // -> performing-finance
  }

  /** Walks the authorization all the way to the mint stage - every mandatory
   *  stage resolved and both gates skipped (company-funded, domestic on
   *  both sides is the negative case for each). */
  function reachMintStage(project: string) {
    const atPerformingFinance = reachPerformingFinance(project);
    return service.acknowledge({ participantId: performingApproverA }, atPerformingFinance.id); // -> both gates skipped, -> charge-number-admin
  }

  /** Raises a correction request against `authorizationId` from `raiserId`,
   *  then immediately supplies the fix as `submitter` - the owner of every
   *  field this suite corrects (BDR-0005). */
  function raiseAndCorrect(authorizationId: string, raiserId: string, fields: string[], correction: Record<string, unknown>) {
    service.requestCorrection({ participantId: raiserId }, authorizationId, {
      fields,
      comment: "Please fix.",
    });
    return service.correct({ participantId: submitter }, authorizationId, correction);
  }

  function rawTransitions(authorizationId: string): { kind: string; payload: string }[] {
    const raw = new DatabaseSync(store.path);
    try {
      return raw
        .prepare("SELECT kind, payload FROM transitions WHERE authorization_id = ? ORDER BY seq")
        .all(authorizationId) as { kind: string; payload: string }[];
    } finally {
      raw.close();
    }
  }

  test("each stage declares, in the relay configuration, the fields its concern rests on", () => {
    const byId = Object.fromEntries(RELAY_CONFIG.map((stage) => [stage.id, stage.fieldDependencies]));
    assert.deepEqual(byId["requesting-program-manager"], [
      "project",
      "requestingDepartmentId",
      "performingDepartmentId",
    ]);
    assert.deepEqual(byId["requesting-finance"], []);
    assert.deepEqual(byId["performing-department"], []);
    assert.deepEqual(byId["performing-program-manager"], ["project", "performingDepartmentId"]);
    assert.deepEqual(byId["performing-finance"], ["resources"]);
    assert.deepEqual(byId["contracts"], ["fundingType"]);
    assert.deepEqual(byId["global-trade"], ["requestingLocationType", "performingLocationType"]);
    assert.deepEqual(byId["charge-number-admin"], []);
  });

  test("a correction that intersects nothing disturbs nobody, and the authorization resumes at the stage that requested it", () => {
    const authorization = reachPerformingFinance("Untouched by its own correction");
    // requestingProgramManager (the named person, not the department) names
    // nobody's declared dependency anywhere in the relay configuration.
    const after = raiseAndCorrect(authorization.id, performingApproverA, ["requestingProgramManager"], {
      requestingProgramManager: "A New Name",
    });

    assert.equal(after.currentStageId, "performing-finance");
    assert.equal(after.isReReview, false);
    assert.equal(after.reReviewCause, null);
    assert.equal(after.requestingProgramManager, "A New Name");
    // Nothing earlier was re-entered - every passed stage has exactly one
    // visit, still the original - and no new visit was appended for the
    // current stage either.
    for (const stageId of [
      "requesting-program-manager",
      "requesting-finance",
      "performing-department",
      "performing-program-manager",
      "performing-finance",
    ]) {
      assert.equal(after.stageHistory.filter((v) => v.stageId === stageId).length, 1);
    }
  });

  test("a stage whose concern rests on nothing survives a correction to a field an earlier stage in the same relay depends on", () => {
    // requesting-finance and performing-department both declare no
    // dependencies. Correcting "project" - a dependency of both program
    // manager stages - must never re-enter either of them, even though it
    // does re-enter stages around them.
    const authorization = reachPerformingFinance("No-dependency stages stay settled");
    const after = raiseAndCorrect(authorization.id, performingApproverA, ["project"], {
      project: "Renamed",
    });

    const requestingFinanceVisits = after.stageHistory.filter((v) => v.stageId === "requesting-finance");
    const performingDeptVisits = after.stageHistory.filter((v) => v.stageId === "performing-department");
    assert.equal(requestingFinanceVisits.length, 1);
    assert.equal(requestingFinanceVisits[0]!.reReviewCause, undefined);
    assert.equal(performingDeptVisits.length, 1);
    assert.equal(performingDeptVisits[0]!.reReviewCause, undefined);
  });

  test("a correction to a field one passed stage depends on returns the authorization there as a re-review", () => {
    // "resources" is performing-finance's own declared dependency. Correct
    // it from global-trade, a stage further along that has already passed
    // performing-finance.
    const atPerformingFinance = reachPerformingFinance("Single-target re-review", {
      requestingLocationType: "domestic",
      performingLocationType: "international",
    });
    const atGlobalTrade = service.acknowledge({ participantId: performingApproverA }, atPerformingFinance.id); // company-funded skips contracts -> global-trade
    assert.equal(atGlobalTrade.currentStageId, "global-trade");

    const after = raiseAndCorrect(atGlobalTrade.id, globalTradeApprover, ["resources"], {
      resources: [{ budgetHours: 100, laborRate: 90 }],
    });

    assert.equal(after.currentStageId, "performing-finance");
    assert.equal(after.isReReview, true);
    assert.equal(after.reReviewCause, "correction");
    assert.equal(after.awaitingCorrection, false);
    assert.deepEqual(
      after.resources.map((r) => ({ budgetHours: r.budgetHours, laborRate: r.laborRate })),
      [{ budgetHours: 100, laborRate: 90 }],
    );
    // performing-finance now has two visits - the original, resolved one,
    // and the live re-review (ADR-0005: "only the latest occurrence is live").
    const visits = after.stageHistory.filter((v) => v.stageId === "performing-finance");
    assert.equal(visits.length, 2);
    assert.ok(visits[0]!.resolvedAt);
    assert.equal(visits[1]!.resolvedAt, null);
    assert.equal(visits[1]!.reReviewCause, "correction");

    // It shows in the performing Approver's queue as a re-review, not a
    // fresh arrival, and it is excluded from anyone else's.
    const queue = service.listMyQueue({ participantId: performingApproverA });
    const queued = queue.find((a) => a.id === after.id);
    assert.ok(queued);
    assert.equal(queued!.isReReview, true);
    assert.ok(!service.listMyQueue({ participantId: globalTradeApprover }).some((a) => a.id === after.id));

    // Re-acknowledging it resumes forward exactly as ADR-0004 describes -
    // straight back to global-trade, since nothing else intersected.
    const resumed = service.acknowledge({ participantId: performingApproverA }, after.id);
    assert.equal(resumed.currentStageId, "global-trade");
    assert.equal(resumed.isReReview, false);
  });

  test("a correction re-enters every stage that intersects, in relay order, leaving what lies between them untouched", () => {
    // "project" is a dependency of both requesting-program-manager (index 0)
    // and performing-program-manager (index 3). Correcting it from
    // performing-finance (index 4, current) must re-enter both, earliest
    // first, while requesting-finance and performing-department (indices 1
    // and 2, both dependency-free) are never disturbed.
    const authorization = reachPerformingFinance("Two targets, in relay order");

    const after = raiseAndCorrect(authorization.id, performingApproverA, ["project"], {
      project: "Renamed mid-flight",
    });

    assert.equal(after.currentStageId, "requesting-program-manager");
    assert.equal(after.reReviewCause, "correction");
    assert.equal(after.project, "Renamed mid-flight");

    for (const stageId of ["requesting-finance", "performing-department"]) {
      assert.equal(after.stageHistory.filter((v) => v.stageId === stageId).length, 1);
    }

    // Resolving the earliest target moves on to the second, skipping the
    // two untouched stages in between without requiring any action there.
    const nextTarget = service.acknowledge({ participantId: requestingApproverA }, after.id);
    assert.equal(nextTarget.currentStageId, "performing-program-manager");
    assert.equal(nextTarget.reReviewCause, "correction");
    assert.equal(nextTarget.stageHistory.filter((v) => v.stageId === "requesting-finance").length, 1);
    assert.equal(nextTarget.stageHistory.filter((v) => v.stageId === "performing-department").length, 1);

    // And resolving that one lands back exactly where the authorization
    // already was - a plain resume, not a third re-review.
    const resumed = service.acknowledge({ participantId: performingApproverA }, nextTarget.id);
    assert.equal(resumed.currentStageId, "performing-finance");
    assert.equal(resumed.isReReview, false);
  });

  test("a gate whose condition no longer holds after a correction skips itself again and re-review moves on", () => {
    // Reach global-trade with a funding type that makes Contracts run, then
    // correct fundingType to company-funded - Contracts' own declared
    // dependency - so its condition now says skip.
    const draft = service.createDraft(
      { participantId: submitter },
      {
        project: "Contracts flips to skip",
        requestingDepartmentId: requestingDeptId,
        performingDepartmentId: performingDeptId,
        fundingType: "commercial-contract",
        requestingLocationType: "domestic",
        performingLocationType: "international",
        requestingProgramManager: "Dana Ferris",
        requestingFinanceApprover: "Kim Osei",
        performingProgramManager: "Lior Amsel",
        performingFinanceApprover: "Priya Nandan",
      },
    );
    service.addResource({ participantId: submitter }, draft.id, { budgetHours: 40, laborRate: 85.5 });
    const initiated = service.initiateDraft({ participantId: submitter }, draft.id);
    service.acknowledge({ participantId: requestingApproverA }, initiated.id);
    service.acknowledge({ participantId: requestingApproverB }, initiated.id);
    service.claim({ participantId: contributorAtPerformingDept }, initiated.id);
    service.contribute({ participantId: contributorAtPerformingDept }, initiated.id, {
      performingEmployee: "Jade Okafor",
    });
    service.acknowledge({ participantId: performingApproverA }, initiated.id);
    const atContracts = service.acknowledge({ participantId: performingApproverA }, initiated.id);
    assert.equal(atContracts.currentStageId, "contracts");
    const atGlobalTrade = service.acknowledge({ participantId: contractsApprover }, atContracts.id);
    assert.equal(atGlobalTrade.currentStageId, "global-trade");

    const after = raiseAndCorrect(atGlobalTrade.id, globalTradeApprover, ["fundingType"], {
      fundingType: "company-funded",
    });

    // Contracts auto-skips again rather than stopping for a human, and
    // nothing intervenes before global-trade, so the authorization lands
    // straight back where it already was.
    assert.equal(after.currentStageId, "global-trade");
    assert.equal(after.isReReview, false);
    const contractsVisits = after.stageHistory.filter((v) => v.stageId === "contracts");
    assert.equal(contractsVisits.length, 2);
    assert.equal(contractsVisits[1]!.reReviewCause, "correction");
    assert.ok(contractsVisits[1]!.resolvedAt, "the re-entered gate should have skipped itself again");
  });

  test("a gate the system skipped, and nobody ever saw, is a fresh arrival rather than a re-review once its condition starts holding", () => {
    // company-funded skips Contracts automatically - no human ever acts on
    // it. Correcting fundingType to a type that makes it run must not claim
    // an approver is "returning" to something nobody there ever did.
    const atGlobalTrade = reachPerformingFinance("Contracts flips from skip to run", {
      requestingLocationType: "domestic",
      performingLocationType: "international",
    });
    const beforeAck = service.acknowledge({ participantId: performingApproverA }, atGlobalTrade.id);
    assert.equal(beforeAck.currentStageId, "global-trade");
    const contractsBefore = beforeAck.stageHistory.find((v) => v.stageId === "contracts")!;
    assert.ok(contractsBefore.resolvedAt, "Contracts should have skipped itself on the way through");

    const after = raiseAndCorrect(beforeAck.id, globalTradeApprover, ["fundingType"], {
      fundingType: "commercial-contract",
    });

    assert.equal(after.currentStageId, "contracts");
    assert.equal(after.isReReview, false);
    assert.equal(after.reReviewCause, null);
    const contractsVisits = after.stageHistory.filter((v) => v.stageId === "contracts");
    assert.equal(contractsVisits.length, 2);
    assert.equal(contractsVisits[1]!.reReviewCause, undefined);
    assert.equal(contractsVisits[1]!.resolvedAt, null);

    // It genuinely awaits a real acknowledgement now.
    const resolved = service.acknowledge({ participantId: contractsApprover }, after.id);
    assert.equal(resolved.currentStageId, "global-trade");
  });

  test("a re-review that silently passes through performing-department does not notify the performing contact again", () => {
    const draft = service.createDraft(
      { participantId: submitter },
      {
        project: "No spurious contact notification",
        requestingDepartmentId: requestingDeptId,
        performingDepartmentId: performingDeptId,
        fundingType: "company-funded",
        requestingLocationType: "domestic",
        performingLocationType: "domestic",
        requestingProgramManager: "Dana Ferris",
        requestingFinanceApprover: "Kim Osei",
        performingProgramManager: "Lior Amsel",
        performingFinanceApprover: "Priya Nandan",
        performingContact: "Priya Okonjo",
      },
    );
    service.addResource({ participantId: submitter }, draft.id, { budgetHours: 40, laborRate: 85.5 });
    const initiated = service.initiateDraft({ participantId: submitter }, draft.id);
    service.acknowledge({ participantId: requestingApproverA }, initiated.id); // -> requesting-finance
    const atPerformingDepartment = service.acknowledge({ participantId: requestingApproverB }, initiated.id); // -> performing-department, fires the one legitimate notification
    assert.equal(atPerformingDepartment.currentStageId, "performing-department");
    assert.equal(
      rawTransitions(initiated.id).filter((t) => t.kind === "contact-notification").length,
      1,
    );

    service.claim({ participantId: contributorAtPerformingDept }, atPerformingDepartment.id);
    service.contribute({ participantId: contributorAtPerformingDept }, atPerformingDepartment.id, {
      performingEmployee: "Jade Okafor",
    });

    // requesting-finance has no declared dependencies, so only an explicit
    // configuration change can target it - correcting a field can never
    // reach it. Re-enter it that way, forcing forward progression to walk
    // straight back through the already-resolved, untouched
    // performing-department on its way to performing-program-manager.
    const raw = new DatabaseSync(store.path);
    let reEntered;
    try {
      reEntered = appendConfigurationChangeReReviewTransition(raw, {
        authorizationId: initiated.id,
        occurredAt: new Date().toISOString(),
        changedStageIds: ["requesting-finance"],
      });
    } finally {
      raw.close();
    }
    assert.equal(reEntered.currentStageId, "requesting-finance");

    service.acknowledge({ participantId: requestingApproverA }, reEntered.id);

    assert.equal(
      rawTransitions(initiated.id).filter((t) => t.kind === "contact-notification").length,
      1,
      "performing-department was silently passed through, not freshly arrived at, so no second notification should fire",
    );
  });

  test("a correction request naming the performing department can only be resolved by withdrawing and raising a new authorization", () => {
    const authorization = reachPerformingFinance("Performing department is fixed at initiation");
    service.requestCorrection({ participantId: performingApproverA }, authorization.id, {
      fields: ["performingDepartmentId"],
      comment: "Wrong department entirely.",
    });
    assert.throws(
      () =>
        service.correct({ participantId: submitter }, authorization.id, {
          performingDepartmentId: requestingDeptId,
        }),
      /fixed once the authorization is initiated/,
    );
  });

  test("a relay-configuration change reaching a stage an authorization has already passed returns it there and re-progresses it forward", () => {
    const authorization = reachMintStage("Configuration change reaches passed stages");
    assert.equal(authorization.currentStageId, "charge-number-admin");

    const raw = new DatabaseSync(store.path);
    let updated;
    try {
      updated = appendConfigurationChangeReReviewTransition(raw, {
        authorizationId: authorization.id,
        occurredAt: new Date().toISOString(),
        changedStageIds: ["performing-program-manager"],
      });
    } finally {
      raw.close();
    }

    assert.equal(updated.currentStageId, "performing-program-manager");
    assert.equal(updated.isReReview, true);
    assert.equal(updated.reReviewCause, "configuration-change");
    // Everything else the authorization already passed stays exactly as it
    // was - one visit each, untouched.
    for (const stageId of ["requesting-program-manager", "requesting-finance", "performing-department"]) {
      assert.equal(updated.stageHistory.filter((v) => v.stageId === stageId).length, 1);
    }

    // It reads in the performing Approver's queue as a re-review.
    const queue = service.listMyQueue({ participantId: performingApproverA });
    const queued = queue.find((a) => a.id === updated.id);
    assert.ok(queued);
    assert.equal(queued!.reReviewCause, "configuration-change");

    // Re-progresses forward: acknowledging it walks the rest of the relay
    // exactly as before, all the way back to completion's doorstep - every
    // stage it silently passes back through along the way (performing-finance,
    // both gates) is untouched, since the configuration change never named
    // them.
    const resumed = service.acknowledge({ participantId: performingApproverA }, updated.id);
    assert.equal(resumed.currentStageId, "charge-number-admin");
    assert.equal(resumed.isReReview, false);
    assert.equal(resumed.stageHistory.filter((v) => v.stageId === "performing-finance").length, 1);
  });

  test("a configuration change naming a stage the authorization has not yet reached does nothing", () => {
    const initiated = initiateAuthorization("Configuration change ahead of current position");
    assert.equal(initiated.currentStageId, "requesting-program-manager");

    const raw = new DatabaseSync(store.path);
    let updated;
    try {
      updated = appendConfigurationChangeReReviewTransition(raw, {
        authorizationId: initiated.id,
        occurredAt: new Date().toISOString(),
        changedStageIds: ["performing-finance", "global-trade"],
      });
    } finally {
      raw.close();
    }

    assert.equal(updated.currentStageId, "requesting-program-manager");
    assert.equal(updated.isReReview, false);
    assert.equal(updated.stageHistory.length, 1);
  });
});
