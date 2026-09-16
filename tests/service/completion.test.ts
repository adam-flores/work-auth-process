import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { createService } from "../../src/service/index.ts";
import { DomainError } from "../../src/service/errors.ts";
import { withTempStore } from "../helpers/temp-store.ts";

/**
 * Charge number, completion, and the classification freeze (#58): the mint
 * stage is the relay's last, reached only once every earlier stage -
 * requesting side, performing side, and both gates - has resolved
 * (CONTEXT.md: despite the name, "the Charge Number Admin ... is a stage in
 * the relay"). Minting supplies a value rather than a judgement (BDR-0003):
 * completion is read back from `chargeNumber` existing, not from a stored
 * state of its own, and the terminal transition it appends freezes the
 * three resolved levels for each side (ADR-0007) so a later hierarchy
 * change cannot rewrite a settled record.
 *
 * The seeded roster (config/participants.json) puts one Charge Number Admin,
 * Sadie Okonkwo, at "Northline Service Center" - a department unrelated to
 * either side of any authorization here, which is what proves the mint
 * queue is scoped by role alone rather than by department the way an
 * Approver's or a gate's is.
 */

describe("charge number, completion, and the classification freeze", () => {
  let store: ReturnType<typeof withTempStore>;
  let service: ReturnType<typeof createService>;
  let submitter: string;
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
    submitter = people.find((p) => p.id === "p-avery-lund")!.id;
    requestingApproverA = people.find((p) => p.id === "p-cate-marchetti")!.id;
    requestingApproverB = people.find((p) => p.id === "p-hugo-strand")!.id;
    performingApproverA = people.find((p) => p.id === "p-mira-devane")!.id;
    contributorAtPerformingDept = people.find((p) => p.id === "p-nils-oyelaran")!.id;
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
        // company-funded, domestic/domestic: the negative case for both
        // gates (BDR-0014 and its sibling), so a single acknowledgement at
        // performing finance walks straight through to the mint stage.
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
    service.addResource({ participantId: submitter }, draft.id, { budgetHours: 12, laborRate: 60 });
    return service.initiateDraft({ participantId: submitter }, draft.id);
  }

  /** Walks every mandatory stage and both (skipped) gates, landing at the
   *  mint stage - the whole happy path this ticket exists to complete
   *  (#58's acceptance criteria: "the mint stage is reached only after
   *  every prior stage has resolved"). */
  function reachMintStage(project: string) {
    const authorization = initiateAuthorization(project);
    service.acknowledge({ participantId: requestingApproverA }, authorization.id); // -> requesting-finance
    service.acknowledge({ participantId: requestingApproverB }, authorization.id); // -> performing-department
    service.claim({ participantId: contributorAtPerformingDept }, authorization.id);
    service.contribute({ participantId: contributorAtPerformingDept }, authorization.id, {
      performingEmployee: "Jade Okafor",
    }); // -> performing-program-manager
    service.acknowledge({ participantId: performingApproverA }, authorization.id); // -> performing-finance
    return service.acknowledge({ participantId: performingApproverA }, authorization.id); // -> both gates skipped, -> charge-number-admin
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

  test("the mint stage is reached only after every prior stage has resolved", () => {
    const authorization = reachMintStage("Reaches the mint stage");
    assert.equal(authorization.currentStageId, "charge-number-admin");
    for (const stageId of [
      "requesting-program-manager",
      "requesting-finance",
      "performing-department",
      "performing-program-manager",
      "performing-finance",
      "contracts",
      "global-trade",
    ]) {
      assert.ok(
        authorization.stageHistory.find((v) => v.stageId === stageId)?.resolvedAt,
        `${stageId} should already be resolved`,
      );
    }
  });

  test("an authorization at the mint stage appears in the Charge Number Admin's queue, scoped by role and not by department", () => {
    const authorization = reachMintStage("Joins the mint queue");
    const queue = service.listMyQueue({ participantId: chargeNumberAdmin });
    assert.ok(queue.some((a) => a.id === authorization.id));

    // Neither the requesting nor the performing Approver's queue has it -
    // it left the relay's approval side entirely.
    assert.ok(!service.listMyQueue({ participantId: requestingApproverA }).some((a) => a.id === authorization.id));
    assert.ok(!service.listMyQueue({ participantId: performingApproverA }).some((a) => a.id === authorization.id));
  });

  test("an unknown authorization id is refused on minting", () => {
    assert.throws(
      () => service.mintChargeNumber({ participantId: chargeNumberAdmin }, "authorization-nope", { chargeNumber: "CN-1" }),
      (err: unknown) => err instanceof DomainError && err.code === "UNKNOWN_AUTHORIZATION",
    );
  });

  test("an unknown authorization id is refused when reading its classification", () => {
    assert.throws(
      () => service.getClassification({ participantId: chargeNumberAdmin }, "authorization-nope"),
      (err: unknown) => err instanceof DomainError && err.code === "UNKNOWN_AUTHORIZATION",
    );
  });

  test("someone who is not a Charge Number Admin may not mint", () => {
    const authorization = reachMintStage("Refused mint");
    assert.throws(
      () => service.mintChargeNumber({ participantId: requestingApproverA }, authorization.id, { chargeNumber: "CN-1" }),
      (err: unknown) => err instanceof DomainError && err.code === "NOT_IN_QUEUE",
    );
  });

  test("a blank charge number is refused", () => {
    const authorization = reachMintStage("Blank charge number");
    assert.throws(
      () => service.mintChargeNumber({ participantId: chargeNumberAdmin }, authorization.id, { chargeNumber: "  " }),
      (err: unknown) => err instanceof DomainError && err.code === "INVALID_REQUEST",
    );
  });

  test("minting moves the authorization to Completed - caused by the charge number existing, not a stored state", () => {
    const authorization = reachMintStage("Mint completes it");
    assert.equal(authorization.chargeNumber, null);

    const completed = service.mintChargeNumber(
      { participantId: chargeNumberAdmin },
      authorization.id,
      { chargeNumber: "CN-48213" },
    );
    assert.equal(completed.chargeNumber, "CN-48213");

    // One completion transition, whatever the resource count on this
    // authorization - a charge number completes the whole authorization,
    // not one per resource.
    assert.equal(authorization.resources.length, 2);
    const completions = rawTransitions(authorization.id).filter((row) => row.kind === "completion");
    assert.equal(completions.length, 1);
    assert.equal(completions[0]!.actor_id, chargeNumberAdmin);

    // It leaves the Charge Number Admin's queue once completed.
    assert.ok(!service.listMyQueue({ participantId: chargeNumberAdmin }).some((a) => a.id === authorization.id));
  });

  test("a completed authorization may not be minted a second time", () => {
    const authorization = reachMintStage("No second mint");
    service.mintChargeNumber({ participantId: chargeNumberAdmin }, authorization.id, { chargeNumber: "CN-1" });
    assert.throws(
      () => service.mintChargeNumber({ participantId: chargeNumberAdmin }, authorization.id, { chargeNumber: "CN-2" }),
      (err: unknown) => err instanceof DomainError && err.code === "NOT_IN_QUEUE",
    );
  });

  test("the terminal transition carries the three resolved levels for each side", () => {
    const authorization = reachMintStage("Freezes the classification");
    const requesting = service.getDepartment({ participantId: chargeNumberAdmin }, requestingDeptId);
    const performing = service.getDepartment({ participantId: chargeNumberAdmin }, performingDeptId);

    const completed = service.mintChargeNumber(
      { participantId: chargeNumberAdmin },
      authorization.id,
      { chargeNumber: "CN-9001" },
    );

    assert.ok(completed.classification);
    assert.deepEqual(completed.classification!.requesting, {
      department: { id: requesting.id, name: requesting.name },
      division: { id: requesting.division.id, name: requesting.division.name },
      legalEntity: { id: requesting.legalEntity.id, name: requesting.legalEntity.name },
    });
    assert.deepEqual(completed.classification!.performing, {
      department: { id: performing.id, name: performing.name },
      division: { id: performing.division.id, name: performing.division.name },
      legalEntity: { id: performing.legalEntity.id, name: performing.legalEntity.name },
    });
  });

  test("a live authorization resolves its classification live, for both sides", () => {
    const authorization = reachMintStage("Reads live before completion");
    assert.equal(authorization.classification, null);

    const requesting = service.getDepartment({ participantId: chargeNumberAdmin }, requestingDeptId);
    const performing = service.getDepartment({ participantId: chargeNumberAdmin }, performingDeptId);

    const classification = service.getClassification({ participantId: chargeNumberAdmin }, authorization.id);
    assert.deepEqual(classification, {
      requesting: {
        department: { id: requesting.id, name: requesting.name },
        division: { id: requesting.division.id, name: requesting.division.name },
        legalEntity: { id: requesting.legalEntity.id, name: requesting.legalEntity.name },
      },
      performing: {
        department: { id: performing.id, name: performing.name },
        division: { id: performing.division.id, name: performing.division.name },
        legalEntity: { id: performing.legalEntity.id, name: performing.legalEntity.name },
      },
    });
  });

  test("a completed authorization reads its classification from the terminal transition, not from the hierarchy", () => {
    const authorization = reachMintStage("Reads frozen after completion");
    const completed = service.mintChargeNumber(
      { participantId: chargeNumberAdmin },
      authorization.id,
      { chargeNumber: "CN-4471" },
    );

    const classification = service.getClassification({ participantId: chargeNumberAdmin }, authorization.id);
    assert.deepEqual(classification, completed.classification);
  });
});
