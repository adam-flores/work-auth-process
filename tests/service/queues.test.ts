import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { createService } from "../../src/service/index.ts";
import { DomainError } from "../../src/service/errors.ts";
import { withTempStore } from "../helpers/temp-store.ts";

/**
 * Queues, and the first acknowledgement (#55): a stage routes to a role at a
 * department, never to a named person - every holder of the role sees the
 * same queue and any of them may acknowledge (BDR-0002, BDR-0013). A queue is
 * derived from the log, not maintained as a list of its own, and acknowledging
 * appends a transition that both resolves the current stage and arrives the
 * authorization at whatever the relay configuration names next.
 *
 * The seeded roster (config/participants.json) puts two Approvers at "Heat
 * Exchange Products" (Cate Marchetti, Hugo Strand) and two at "Rotor Hubs"
 * (Mira Devane, Tomas Eiriksen) - real department names from the synthetic
 * hierarchy, which is what lets a stage's queue be resolved by matching an
 * authorization's requesting/performing department name against a
 * participant's own.
 */

describe("queues and acknowledgement", () => {
  let store: ReturnType<typeof withTempStore>;
  let service: ReturnType<typeof createService>;
  let submitter: string;
  let requestingApproverA: string;
  let requestingApproverB: string;
  let performingApproverA: string;
  let contributorAtRequestingDept: string;
  let contributorAtPerformingDept: string;
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
    contributorAtRequestingDept = people.find((p) => p.id === "p-avery-lund")!.id;
    contributorAtPerformingDept = people.find((p) => p.id === "p-nils-oyelaran")!.id;

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

  test("an initiated authorization appears in the requesting department's Approver queue", () => {
    const authorization = initiateAuthorization("Queue visibility");
    const queue = service.listMyQueue({ participantId: requestingApproverA });
    assert.ok(queue.some((a) => a.id === authorization.id));
  });

  test("every holder of the role at that department sees the same item - not a named person", () => {
    const authorization = initiateAuthorization("Shared by role");
    const queueA = service.listMyQueue({ participantId: requestingApproverA });
    const queueB = service.listMyQueue({ participantId: requestingApproverB });
    assert.ok(queueA.some((a) => a.id === authorization.id));
    assert.ok(queueB.some((a) => a.id === authorization.id));
  });

  test("an approver at a different department does not see it", () => {
    const authorization = initiateAuthorization("Not staged here yet");
    const queue = service.listMyQueue({ participantId: performingApproverA });
    assert.ok(!queue.some((a) => a.id === authorization.id));
  });

  test("a Contributor holds no queue, even at the routed department", () => {
    initiateAuthorization("Contributor has no queue");
    const queue = service.listMyQueue({ participantId: contributorAtRequestingDept });
    assert.deepEqual(queue, []);
  });

  test("system holds no queue", () => {
    initiateAuthorization("System has no queue");
    assert.deepEqual(service.listMyQueue({ participantId: "system" }), []);
  });

  test("opening a queued item shows the whole authorization - no stage sees less of it", () => {
    const authorization = initiateAuthorization("Full record on open");
    const opened = service.getAuthorization({ participantId: requestingApproverA }, authorization.id);
    assert.deepEqual(opened, authorization);
  });

  test("each stage records three timestamps, arrived and notified at initiation, resolved while null", () => {
    const authorization = initiateAuthorization("Three timestamps");
    assert.equal(authorization.stageHistory.length, 1);
    const [firstVisit] = authorization.stageHistory;
    assert.equal(firstVisit!.stageId, "requesting-program-manager");
    assert.ok(firstVisit!.arrivedAt.length > 0);
    assert.ok(firstVisit!.notifiedAt.length > 0);
    assert.equal(firstVisit!.resolvedAt, null);
    assert.deepEqual(Object.keys(firstVisit!).sort(), ["arrivedAt", "notifiedAt", "resolvedAt", "stageId"]);
  });

  test("someone outside the queue may not acknowledge it", () => {
    const authorization = initiateAuthorization("Refused acknowledgement");
    assert.throws(
      () => service.acknowledge({ participantId: performingApproverA }, authorization.id),
      (err: unknown) => err instanceof DomainError && err.code === "NOT_IN_QUEUE",
    );
  });

  test("acknowledging appends a transition, resolves the stage, and advances to what the relay names next", () => {
    const authorization = initiateAuthorization("First acknowledgement");
    const acknowledged = service.acknowledge({ participantId: requestingApproverA }, authorization.id);

    assert.equal(acknowledged.currentStageId, "requesting-finance");
    assert.equal(acknowledged.stageHistory.length, 2);
    assert.equal(acknowledged.stageHistory[0]!.stageId, "requesting-program-manager");
    assert.ok(acknowledged.stageHistory[0]!.resolvedAt, "the first stage now has a resolved timestamp");
    assert.equal(acknowledged.stageHistory[1]!.stageId, "requesting-finance");
    assert.equal(acknowledged.stageHistory[1]!.resolvedAt, null);
  });

  test("an acknowledged authorization leaves the acknowledger's department queue once the relay moves it elsewhere", () => {
    const authorization = initiateAuthorization("Leaves on department change");

    // Two acknowledgements at the requesting side (both stages route to the
    // same department) before the relay reaches the performing side, which
    // now lands in the performing department's *contribution* queue (#56) -
    // an Approver's queue, not a Contributor's.
    service.acknowledge({ participantId: requestingApproverA }, authorization.id);
    const advanced = service.acknowledge({ participantId: requestingApproverB }, authorization.id);
    assert.equal(advanced.currentStageId, "performing-department");

    const requestingQueue = service.listMyQueue({ participantId: requestingApproverA });
    assert.ok(!requestingQueue.some((a) => a.id === authorization.id));

    const performingApproverQueue = service.listMyQueue({ participantId: performingApproverA });
    assert.ok(!performingApproverQueue.some((a) => a.id === authorization.id));

    const performingContributorQueue = service.listMyQueue({ participantId: contributorAtPerformingDept });
    assert.ok(performingContributorQueue.some((a) => a.id === authorization.id));
  });

  test("an unknown authorization id is refused on acknowledgement", () => {
    assert.throws(
      () => service.acknowledge({ participantId: requestingApproverA }, "authorization-nope"),
      (err: unknown) => err instanceof DomainError && err.code === "UNKNOWN_AUTHORIZATION",
    );
  });

  test("an authorization that reaches a gate stage is in nobody's queue yet, and does not break anyone else's", () => {
    // Nothing stops acknowledging and contributing straight through the
    // relay's mandatory stages into a gate (#57 has not built the two gates
    // yet) - a queue read must tolerate that rather than throwing for every
    // caller.
    const authorization = initiateAuthorization("Reaches a gate");
    service.acknowledge({ participantId: requestingApproverA }, authorization.id); // -> requesting-finance
    service.acknowledge({ participantId: requestingApproverB }, authorization.id); // -> performing-department
    service.claim({ participantId: contributorAtPerformingDept }, authorization.id);
    service.contribute({ participantId: contributorAtPerformingDept }, authorization.id, {
      performingEmployee: "Jade Okafor",
    }); // -> performing-program-manager
    service.acknowledge({ participantId: performingApproverA }, authorization.id); // -> performing-finance
    const atGate = service.acknowledge({ participantId: performingApproverA }, authorization.id); // -> contracts
    assert.equal(atGate.currentStageId, "contracts");

    assert.doesNotThrow(() => service.listMyQueue({ participantId: requestingApproverA }));
    const anyonesQueue = service.listMyQueue({ participantId: performingApproverA });
    assert.ok(!anyonesQueue.some((a) => a.id === authorization.id));
  });

  test("the caller may supply the acknowledgement's timestamp instead of the clock", () => {
    const authorization = initiateAuthorization("Supplied timestamp");
    const suppliedTimestamp = "2026-02-01T10:00:00.000Z";
    const acknowledged = service.acknowledge(
      { participantId: requestingApproverA },
      authorization.id,
      { occurredAt: suppliedTimestamp },
    );
    assert.equal(acknowledged.stageHistory[0]!.resolvedAt, suppliedTimestamp);
  });
});
