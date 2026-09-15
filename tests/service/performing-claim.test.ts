import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { createService } from "../../src/service/index.ts";
import { DomainError } from "../../src/service/errors.ts";
import { withTempStore } from "../helpers/temp-store.ts";

/**
 * The performing department's claim, and contributing the performing-side
 * section (#56): the mandatory relay's full path, requesting program
 * manager through performing finance, with the performing department's
 * contribution stage sitting between requesting finance and performing
 * program manager. An unclaimed authorization arrives in the performing
 * department's queue - every Contributor there sees it (BDR-0002,
 * BDR-0013) - claiming names the claimer as the performing contributor, and
 * only that contributor may complete the stage by naming the employee who
 * will perform the work. A named performing-side contact is notified, but
 * the department queue stays authoritative (CONTEXT.md: "Claim").
 *
 * The seeded roster (config/participants.json) puts two Contributors at
 * "Rotor Hubs" (Nils Oyelaran, Lena Birch) and one at "Thermal Coatings"
 * (Rosa Imbert) - real department names from the synthetic hierarchy, the
 * same fixture `queues.test.ts` uses.
 */

describe("the performing department's claim and contribution", () => {
  let store: ReturnType<typeof withTempStore>;
  let service: ReturnType<typeof createService>;
  let submitter: string;
  let requestingApprover: string;
  let performingApprover: string;
  let contributorAtPerformingDept: string;
  let anotherContributorAtPerformingDept: string;
  let contributorAtOtherDept: string;
  let requestingDeptId: string;
  let performingDeptId: string;

  before(() => {
    store = withTempStore();
    service = createService({ storePath: store.path });

    const people = service.listParticipants({ participantId: "system" });
    submitter = people.find((p) => p.id === "p-avery-lund")!.id;
    requestingApprover = people.find((p) => p.id === "p-cate-marchetti")!.id;
    performingApprover = people.find((p) => p.id === "p-mira-devane")!.id;
    contributorAtPerformingDept = people.find((p) => p.id === "p-nils-oyelaran")!.id;
    anotherContributorAtPerformingDept = people.find((p) => p.id === "p-lena-birch")!.id;
    contributorAtOtherDept = people.find((p) => p.id === "p-rosa-imbert")!.id;

    const departments = service.searchDepartments({ participantId: "system" });
    requestingDeptId = departments.find((d) => d.name === "Heat Exchange Products")!.id;
    performingDeptId = departments.find((d) => d.name === "Rotor Hubs")!.id;
  });
  after(() => {
    service.close();
    store.cleanup();
  });

  function initiateAuthorization(project: string, performingContact: string | null = null) {
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
        performingContact,
      },
    );
    service.addResource({ participantId: submitter }, draft.id, { budgetHours: 40, laborRate: 85.5 });
    return service.initiateDraft({ participantId: submitter }, draft.id);
  }

  /** Walks an authorization from initiation to the performing-department
   *  stage - the two requesting-side acknowledgements #56 sits behind. */
  function reachPerformingDepartment(project: string, performingContact: string | null = null) {
    const authorization = initiateAuthorization(project, performingContact);
    service.acknowledge({ participantId: requestingApprover }, authorization.id);
    return service.acknowledge({ participantId: requestingApprover }, authorization.id);
  }

  test("an unclaimed authorization appears in the performing department's queue", () => {
    const authorization = reachPerformingDepartment("Arrives unclaimed");
    assert.equal(authorization.currentStageId, "performing-department");
    assert.equal(authorization.performingContributorId, null);

    const queue = service.listMyQueue({ participantId: contributorAtPerformingDept });
    assert.ok(queue.some((a) => a.id === authorization.id));
  });

  test("a Contributor at a different department does not see it", () => {
    const authorization = reachPerformingDepartment("Not this department's problem");
    const queue = service.listMyQueue({ participantId: contributorAtOtherDept });
    assert.ok(!queue.some((a) => a.id === authorization.id));
  });

  test("an Approver at the performing department does not see it in their queue - it is not an approval stage", () => {
    const authorization = reachPerformingDepartment("Not an Approver's stage");
    const queue = service.listMyQueue({ participantId: performingApprover });
    assert.ok(!queue.some((a) => a.id === authorization.id));
  });

  test("claiming names the claimer as the performing contributor", () => {
    const authorization = reachPerformingDepartment("Claimed");
    const claimed = service.claim({ participantId: contributorAtPerformingDept }, authorization.id);
    assert.equal(claimed.performingContributorId, contributorAtPerformingDept);
    // Claiming does not resolve the stage - the authorization stays put
    // until it is contributed.
    assert.equal(claimed.currentStageId, "performing-department");
  });

  test("the department queue distinguishes claimed from unclaimed rather than filtering the claimed one out", () => {
    const authorization = reachPerformingDepartment("Still visible once claimed");
    service.claim({ participantId: contributorAtPerformingDept }, authorization.id);

    const queue = service.listMyQueue({ participantId: anotherContributorAtPerformingDept });
    const found = queue.find((a) => a.id === authorization.id);
    assert.ok(found, "a claimed authorization stays in the department's queue");
    assert.equal(found!.performingContributorId, contributorAtPerformingDept);
  });

  test("a second Contributor may not claim an already-claimed authorization", () => {
    const authorization = reachPerformingDepartment("Claimed once");
    service.claim({ participantId: contributorAtPerformingDept }, authorization.id);
    assert.throws(
      () => service.claim({ participantId: anotherContributorAtPerformingDept }, authorization.id),
      (err: unknown) => err instanceof DomainError && err.code === "NOT_IN_QUEUE",
    );
  });

  test("a Contributor outside the department may not claim it", () => {
    const authorization = reachPerformingDepartment("Wrong department");
    assert.throws(
      () => service.claim({ participantId: contributorAtOtherDept }, authorization.id),
      (err: unknown) => err instanceof DomainError && err.code === "NOT_IN_QUEUE",
    );
  });

  test("only the contributor who claimed it may fill the performing-side section", () => {
    const authorization = reachPerformingDepartment("Not yours to fill in");
    service.claim({ participantId: contributorAtPerformingDept }, authorization.id);
    assert.throws(
      () =>
        service.contribute(
          { participantId: anotherContributorAtPerformingDept },
          authorization.id,
          { performingEmployee: "Someone else" },
        ),
      (err: unknown) => err instanceof DomainError && err.code === "NOT_CLAIMANT",
    );
  });

  test("contributing before claiming is refused the same way", () => {
    const authorization = reachPerformingDepartment("No claim yet");
    assert.throws(
      () =>
        service.contribute({ participantId: contributorAtPerformingDept }, authorization.id, {
          performingEmployee: "Too soon",
        }),
      (err: unknown) => err instanceof DomainError && err.code === "NOT_CLAIMANT",
    );
  });

  test("contributing records the employee performing the work and resolves the stage", () => {
    const authorization = reachPerformingDepartment("Completed");
    service.claim({ participantId: contributorAtPerformingDept }, authorization.id);
    const contributed = service.contribute(
      { participantId: contributorAtPerformingDept },
      authorization.id,
      { performingEmployee: "Jamie Okonkwo" },
    );

    assert.equal(contributed.performingEmployee, "Jamie Okonkwo");
    assert.equal(contributed.currentStageId, "performing-program-manager");
    const performingDeptVisit = contributed.stageHistory.find((v) => v.stageId === "performing-department")!;
    assert.ok(performingDeptVisit.resolvedAt, "the performing-department stage now has a resolved timestamp");
  });

  test("a blank employee name is refused", () => {
    const authorization = reachPerformingDepartment("Blank name refused");
    service.claim({ participantId: contributorAtPerformingDept }, authorization.id);
    assert.throws(
      () =>
        service.contribute({ participantId: contributorAtPerformingDept }, authorization.id, {
          performingEmployee: "   ",
        }),
      (err: unknown) => err instanceof DomainError && err.code === "INVALID_REQUEST",
    );
  });

  test("once contributed, it leaves the performing department's contribution queue", () => {
    const authorization = reachPerformingDepartment("Leaves the queue");
    service.claim({ participantId: contributorAtPerformingDept }, authorization.id);
    service.contribute({ participantId: contributorAtPerformingDept }, authorization.id, {
      performingEmployee: "Robin Achebe",
    });

    const contributorQueue = service.listMyQueue({ participantId: contributorAtPerformingDept });
    assert.ok(!contributorQueue.some((a) => a.id === authorization.id));

    const approverQueue = service.listMyQueue({ participantId: performingApprover });
    assert.ok(approverQueue.some((a) => a.id === authorization.id));
  });

  test("an unknown authorization id is refused on claim and on contribute", () => {
    assert.throws(
      () => service.claim({ participantId: contributorAtPerformingDept }, "authorization-nope"),
      (err: unknown) => err instanceof DomainError && err.code === "UNKNOWN_AUTHORIZATION",
    );
    assert.throws(
      () =>
        service.contribute({ participantId: contributorAtPerformingDept }, "authorization-nope", {
          performingEmployee: "Nobody",
        }),
      (err: unknown) => err instanceof DomainError && err.code === "UNKNOWN_AUTHORIZATION",
    );
  });

  test("a named performing-side contact is notified on arrival, but the department queue stays authoritative", () => {
    const authorization = reachPerformingDepartment("Contact notified", "Priya Okonjo");

    const raw = new DatabaseSync(store.path);
    let notified: { payload: string }[];
    try {
      notified = raw
        .prepare("SELECT payload FROM transitions WHERE authorization_id = ? AND kind = 'contact-notification'")
        .all(authorization.id) as { payload: string }[];
    } finally {
      raw.close();
    }
    assert.equal(notified.length, 1);
    assert.deepEqual(JSON.parse(notified[0]!.payload), { contact: "Priya Okonjo" });

    // The contact adds a notification only - claiming still works the same
    // way, and the queue is still what is authoritative.
    const claimed = service.claim({ participantId: contributorAtPerformingDept }, authorization.id);
    assert.equal(claimed.performingContributorId, contributorAtPerformingDept);
  });

  test("no performing-side contact means no contact-notification transition", () => {
    const authorization = reachPerformingDepartment("No contact named", null);

    const raw = new DatabaseSync(store.path);
    let notified: unknown[];
    try {
      notified = raw
        .prepare("SELECT payload FROM transitions WHERE authorization_id = ? AND kind = 'contact-notification'")
        .all(authorization.id);
    } finally {
      raw.close();
    }
    assert.equal(notified.length, 0);
  });

  test("the caller may supply the claim and contribution timestamps instead of the clock", () => {
    const authorization = reachPerformingDepartment("Supplied timestamps");
    const claimedAt = "2026-02-02T09:00:00.000Z";
    const contributedAt = "2026-02-02T10:00:00.000Z";

    service.claim({ participantId: contributorAtPerformingDept }, authorization.id, { occurredAt: claimedAt });
    const contributed = service.contribute(
      { participantId: contributorAtPerformingDept },
      authorization.id,
      { performingEmployee: "Sam Roux", occurredAt: contributedAt },
    );

    const performingDeptVisit = contributed.stageHistory.find((v) => v.stageId === "performing-department")!;
    assert.equal(performingDeptVisit.resolvedAt, contributedAt);
  });
});
