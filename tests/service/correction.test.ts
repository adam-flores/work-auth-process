import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { createService } from "../../src/service/index.ts";
import { DomainError } from "../../src/service/errors.ts";
import { withTempStore, addTestParticipant } from "../helpers/temp-store.ts";

/**
 * Correction request and correction in place (#59, BDR-0005): an Approver
 * who finds something wrong names the fields at fault with a mandatory
 * comment, addressed to the owner of those fields - the submitter,
 * generally, or the performing contributor for `performingEmployee` (#56),
 * the one field they alone supply. The authorization's position never
 * moves: the stage it sits at becomes *awaiting correction*, a condition
 * read from the log rather than a state stored on the authorization
 * (`Authorization.awaitingCorrection` in `authorizations/index.ts`). It
 * leaves the approver's queue - they cannot act on it until the correction
 * lands - and sits in the corrector's queue only. A correction supplies a
 * value for every field the request named, and no others; the moment it is
 * appended, the same approver resumes exactly where they left it.
 *
 * The fixture departments are the same ones `queues.test.ts` and
 * `performing-claim.test.ts` already use: "Rotor Assemblies" (requesting)
 * and "Flight Controls Software" (performing). The demo roster (#92) seeds
 * only one Approver at the requesting department and one Contributor at the
 * performing department, so a second requesting-side Approver, a second
 * Contributor at the performing department, and a Contributor at a third,
 * unrelated department ("Sensor Integration") are all added directly to
 * this test's own store (`addTestParticipant`).
 */

describe("correction request and correction in place", () => {
  let store: ReturnType<typeof withTempStore>;
  let service: ReturnType<typeof createService>;
  let submitter: string;
  let requestingApproverA: string;
  let requestingApproverB: string;
  let performingApproverA: string;
  let contributorAtPerformingDept: string;
  let anotherContributorAtPerformingDept: string;
  let contributorAtOtherDept: string;
  let requestingDeptId: string;
  let performingDeptId: string;
  let anotherDomesticDeptId: string;

  before(() => {
    store = withTempStore();
    service = createService({ storePath: store.path });
    addTestParticipant(store.path, {
      id: "p-test-second-requesting-approver",
      name: "Test Second Requesting Approver",
      role: "Approver",
      department: "Rotor Assemblies",
    });
    addTestParticipant(store.path, {
      id: "p-test-another-contributor",
      name: "Test Another Contributor",
      role: "Contributor",
      department: "Flight Controls Software",
    });
    addTestParticipant(store.path, {
      id: "p-test-other-dept-contributor",
      name: "Test Other-Department Contributor",
      role: "Contributor",
      department: "Sensor Integration",
    });

    const people = service.listParticipants({ participantId: "system" });
    submitter = people.find((p) => p.id === "p-teo-brandt")!.id;
    requestingApproverA = people.find((p) => p.id === "p-priya-anand")!.id;
    requestingApproverB = people.find((p) => p.id === "p-test-second-requesting-approver")!.id;
    performingApproverA = people.find((p) => p.id === "p-marcus-oduya")!.id;
    contributorAtPerformingDept = people.find((p) => p.id === "p-jordan-hale")!.id;
    anotherContributorAtPerformingDept = people.find((p) => p.id === "p-test-another-contributor")!.id;
    contributorAtOtherDept = people.find((p) => p.id === "p-test-other-dept-contributor")!.id;

    const departments = service.searchDepartments({ participantId: "system" });
    requestingDeptId = departments.find((d) => d.name === "Rotor Assemblies")!.id;
    performingDeptId = departments.find((d) => d.name === "Flight Controls Software")!.id;

    const domestic = service.searchDepartments(
      { participantId: "system" },
      { attributes: [{ name: "jurisdiction", value: "domestic" }] },
    );
    anotherDomesticDeptId = domestic.find(
      (d) => d.id !== requestingDeptId && d.id !== performingDeptId,
    )!.id;
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

  /** Claims and contributes, landing the authorization at
   *  performing-program-manager - the first stage past the contribution
   *  where `performingEmployee` is set and correctable. */
  function reachPerformingProgramManager(project: string) {
    const authorization = initiateAuthorization(project);
    service.acknowledge({ participantId: requestingApproverA }, authorization.id);
    service.acknowledge({ participantId: requestingApproverA }, authorization.id);
    service.claim({ participantId: contributorAtPerformingDept }, authorization.id);
    return service.contribute({ participantId: contributorAtPerformingDept }, authorization.id, {
      performingEmployee: "Original Employee",
    });
  }

  describe("raising a correction request", () => {
    test("names the fields at fault with a comment, and the authorization's position does not change", () => {
      const authorization = initiateAuthorization("Correction target");
      const requested = service.requestCorrection(
        { participantId: requestingApproverA },
        authorization.id,
        { fields: ["project"], comment: "The project name is wrong." },
      );

      assert.equal(requested.currentStageId, "requesting-program-manager");
      assert.equal(requested.awaitingCorrection, true);
      assert.deepEqual(requested.correctionRequest, {
        fields: ["project"],
        comment: "The project name is wrong.",
        requestedBy: requestingApproverA,
        requestedAt: requested.correctionRequest!.requestedAt,
      });
      // Position unmoved: still one stage in history, still unresolved.
      assert.equal(requested.stageHistory.length, 1);
      assert.equal(requested.stageHistory[0]!.resolvedAt, null);
    });

    test("at least one field must be named", () => {
      const authorization = initiateAuthorization("No fields named");
      assert.throws(
        () =>
          service.requestCorrection({ participantId: requestingApproverA }, authorization.id, {
            fields: [],
            comment: "Something is wrong.",
          }),
        (err: unknown) => err instanceof DomainError && err.code === "INVALID_REQUEST",
      );
    });

    test("a field may not be named twice", () => {
      const authorization = initiateAuthorization("Duplicate field");
      assert.throws(
        () =>
          service.requestCorrection({ participantId: requestingApproverA }, authorization.id, {
            fields: ["project", "project"],
            comment: "Something is wrong.",
          }),
        (err: unknown) => err instanceof DomainError && err.code === "INVALID_REQUEST",
      );
    });

    test("a blank comment is refused", () => {
      const authorization = initiateAuthorization("Blank comment");
      assert.throws(
        () =>
          service.requestCorrection({ participantId: requestingApproverA }, authorization.id, {
            fields: ["project"],
            comment: "   ",
          }),
        (err: unknown) => err instanceof DomainError && err.code === "INVALID_REQUEST",
      );
    });

    test("fields spanning both the submitter's ground and performingEmployee are refused - one request, one corrector", () => {
      const authorization = initiateAuthorization("Mixed owners");
      assert.throws(
        () =>
          service.requestCorrection({ participantId: requestingApproverA }, authorization.id, {
            fields: ["project", "performingEmployee"],
            comment: "Two different problems.",
          }),
        (err: unknown) => err instanceof DomainError && err.code === "INVALID_REQUEST",
      );
    });

    test("someone outside the queue may not raise one", () => {
      const authorization = initiateAuthorization("Not this approver's stage");
      assert.throws(
        () =>
          service.requestCorrection({ participantId: performingApproverA }, authorization.id, {
            fields: ["project"],
            comment: "Not yours to flag.",
          }),
        (err: unknown) => err instanceof DomainError && err.code === "NOT_IN_QUEUE",
      );
    });

    test("a Contributor holds no queue to raise one from, even at the routed department", () => {
      const authorization = initiateAuthorization("Contributor cannot raise one");
      assert.throws(
        () =>
          service.requestCorrection({ participantId: submitter }, authorization.id, {
            fields: ["project"],
            comment: "Contributors don't judge.",
          }),
        (err: unknown) => err instanceof DomainError && err.code === "NOT_IN_QUEUE",
      );
    });

    test("the performing department may not be named alongside another field - it would strand that field forever", () => {
      const authorization = initiateAuthorization("Performing department bundled");
      assert.throws(
        () =>
          service.requestCorrection({ participantId: requestingApproverA }, authorization.id, {
            fields: ["performingDepartmentId", "project"],
            comment: "Two problems, one unfixable.",
          }),
        (err: unknown) => err instanceof DomainError && err.code === "INVALID_REQUEST",
      );
    });

    test("naming performingEmployee before anyone has claimed the authorization is refused", () => {
      const authorization = initiateAuthorization("No contributor yet");
      assert.throws(
        () =>
          service.requestCorrection({ participantId: requestingApproverA }, authorization.id, {
            fields: ["performingEmployee"],
            comment: "Too early to name this.",
          }),
        (err: unknown) => err instanceof DomainError && err.code === "INVALID_REQUEST",
      );
    });

    test("an unknown authorization id is refused", () => {
      assert.throws(
        () =>
          service.requestCorrection({ participantId: requestingApproverA }, "authorization-nope", {
            fields: ["project"],
            comment: "Doesn't exist.",
          }),
        (err: unknown) => err instanceof DomainError && err.code === "UNKNOWN_AUTHORIZATION",
      );
    });
  });

  describe("the queue while awaiting correction", () => {
    test("leaves every holder of the role's queue at that department, not only the one who raised it", () => {
      const authorization = initiateAuthorization("Leaves the department's queue");
      service.requestCorrection({ participantId: requestingApproverA }, authorization.id, {
        fields: ["project"],
        comment: "Wrong project.",
      });

      const queueA = service.listMyQueue({ participantId: requestingApproverA });
      const queueB = service.listMyQueue({ participantId: requestingApproverB });
      assert.ok(!queueA.some((a) => a.id === authorization.id));
      assert.ok(!queueB.some((a) => a.id === authorization.id));
    });

    test("sits in the corrector's queue only", () => {
      const authorization = initiateAuthorization("Corrector's queue");
      service.requestCorrection({ participantId: requestingApproverA }, authorization.id, {
        fields: ["project"],
        comment: "Wrong project.",
      });

      const submitterQueue = service.listMyQueue({ participantId: submitter });
      assert.ok(submitterQueue.some((a) => a.id === authorization.id));
    });

    test("the approver who raised it cannot act on it", () => {
      const authorization = initiateAuthorization("Approver locked out");
      service.requestCorrection({ participantId: requestingApproverA }, authorization.id, {
        fields: ["project"],
        comment: "Wrong project.",
      });

      assert.throws(
        () => service.acknowledge({ participantId: requestingApproverA }, authorization.id),
        (err: unknown) => err instanceof DomainError && err.code === "NOT_IN_QUEUE",
      );
      assert.throws(
        () =>
          service.requestCorrection({ participantId: requestingApproverA }, authorization.id, {
            fields: ["requestingProgramManager"],
            comment: "Also wrong.",
          }),
        (err: unknown) => err instanceof DomainError && err.code === "NOT_IN_QUEUE",
      );
    });
  });

  describe("correcting a field", () => {
    test("the submitter corrects it, and the approver resumes exactly where they left it", () => {
      const authorization = initiateAuthorization("Resumed");
      service.requestCorrection({ participantId: requestingApproverA }, authorization.id, {
        fields: ["project"],
        comment: "Wrong project name.",
      });

      const corrected = service.correct({ participantId: submitter }, authorization.id, {
        project: "Corrected project",
      });

      assert.equal(corrected.currentStageId, "requesting-program-manager");
      assert.equal(corrected.awaitingCorrection, false);
      assert.equal(corrected.correctionRequest, null);
      assert.equal(corrected.project, "Corrected project");
      assert.equal(corrected.stageHistory.length, 1);
      assert.equal(corrected.stageHistory[0]!.resolvedAt, null);

      // The same approver resumes - the stage is acknowledgeable again.
      const advanced = service.acknowledge({ participantId: requestingApproverA }, authorization.id);
      assert.equal(advanced.currentStageId, "requesting-finance");
    });

    test("must supply a value for every field named, and no others", () => {
      const authorization = initiateAuthorization("Exact field set");
      service.requestCorrection({ participantId: requestingApproverA }, authorization.id, {
        fields: ["project", "requestingProgramManager"],
        comment: "Two problems.",
      });

      assert.throws(
        () => service.correct({ participantId: submitter }, authorization.id, { project: "Only one" }),
        (err: unknown) => err instanceof DomainError && err.code === "INVALID_REQUEST",
      );
      assert.throws(
        () =>
          service.correct({ participantId: submitter }, authorization.id, {
            project: "Both",
            requestingProgramManager: "New PM",
            performingContact: "Extra field not asked for",
          }),
        (err: unknown) => err instanceof DomainError && err.code === "INVALID_REQUEST",
      );

      const corrected = service.correct({ participantId: submitter }, authorization.id, {
        project: "Both",
        requestingProgramManager: "New PM",
      });
      assert.equal(corrected.project, "Both");
      assert.equal(corrected.requestingProgramManager, "New PM");
    });

    test("only the owner of the named fields may correct them", () => {
      const authorization = initiateAuthorization("Not yours to correct");
      service.requestCorrection({ participantId: requestingApproverA }, authorization.id, {
        fields: ["project"],
        comment: "Wrong project.",
      });

      assert.throws(
        () =>
          service.correct({ participantId: contributorAtPerformingDept }, authorization.id, {
            project: "Not allowed",
          }),
        (err: unknown) => err instanceof DomainError && err.code === "NOT_CORRECTOR",
      );
    });

    test("correcting with nothing outstanding is refused", () => {
      const authorization = initiateAuthorization("Nothing outstanding");
      assert.throws(
        () => service.correct({ participantId: submitter }, authorization.id, { project: "Anything" }),
        (err: unknown) => err instanceof DomainError && err.code === "NOT_AWAITING_CORRECTION",
      );
    });

    test("an invalid corrected value is refused the same way the field's own validator refuses it at draft time", () => {
      const authorization = initiateAuthorization("Invalid correction value");
      service.requestCorrection({ participantId: requestingApproverA }, authorization.id, {
        fields: ["project"],
        comment: "Wrong project.",
      });

      assert.throws(
        () => service.correct({ participantId: submitter }, authorization.id, { project: "   " }),
        (err: unknown) => err instanceof DomainError && err.code === "INVALID_REQUEST",
      );
    });

    test("an unknown authorization id is refused", () => {
      assert.throws(
        () => service.correct({ participantId: submitter }, "authorization-nope", { project: "Anything" }),
        (err: unknown) => err instanceof DomainError && err.code === "UNKNOWN_AUTHORIZATION",
      );
    });

    test("the requesting department may still not equal the performing department once corrected", () => {
      const authorization = initiateAuthorization("Same department refused");
      service.requestCorrection({ participantId: requestingApproverA }, authorization.id, {
        fields: ["requestingDepartmentId"],
        comment: "Wrong requesting department.",
      });

      assert.throws(
        () =>
          service.correct({ participantId: submitter }, authorization.id, {
            requestingDepartmentId: performingDeptId,
          }),
        (err: unknown) => err instanceof DomainError && err.code === "INVALID_REQUEST",
      );
    });

    test("correcting the requesting department to a different, permitted one updates it", () => {
      const authorization = initiateAuthorization("Requesting department corrected");
      service.requestCorrection({ participantId: requestingApproverA }, authorization.id, {
        fields: ["requestingDepartmentId"],
        comment: "Wrong requesting department.",
      });

      const corrected = service.correct({ participantId: submitter }, authorization.id, {
        requestingDepartmentId: anotherDomesticDeptId,
      });
      assert.equal(corrected.requestingDepartmentId, anotherDomesticDeptId);
    });

    test("resources are replaced wholesale, with freshly assigned ids", () => {
      const authorization = initiateAuthorization("Resources corrected");
      const originalResourceId = authorization.resources[0]!.id;
      service.requestCorrection({ participantId: requestingApproverA }, authorization.id, {
        fields: ["resources"],
        comment: "Wrong labor rate.",
      });

      const corrected = service.correct({ participantId: submitter }, authorization.id, {
        resources: [{ budgetHours: 20, laborRate: 120 }],
      });

      assert.equal(corrected.resources.length, 1);
      assert.equal(corrected.resources[0]!.budgetHours, 20);
      assert.equal(corrected.resources[0]!.laborRate, 120);
      assert.notEqual(corrected.resources[0]!.id, originalResourceId);
    });

    test("the performing department can be named as at fault, but can never be corrected (BDR-0012)", () => {
      const authorization = initiateAuthorization("Performing department uncorrectable");
      service.requestCorrection({ participantId: requestingApproverA }, authorization.id, {
        fields: ["performingDepartmentId"],
        comment: "Wrong department entirely.",
      });

      assert.throws(
        () => service.correct({ participantId: submitter }, authorization.id, {}),
        (err: unknown) => err instanceof DomainError && err.code === "FIELD_NOT_CORRECTABLE",
      );
    });

    test("the caller may supply the correction's timestamp instead of the clock", () => {
      const authorization = initiateAuthorization("Supplied timestamp");
      service.requestCorrection({ participantId: requestingApproverA }, authorization.id, {
        fields: ["project"],
        comment: "Wrong project.",
      });
      const correctedAt = "2026-02-03T09:00:00.000Z";
      const corrected = service.correct({ participantId: submitter }, authorization.id, {
        project: "Timestamped correction",
        occurredAt: correctedAt,
      });
      assert.equal(corrected.awaitingCorrection, false);
      assert.equal(corrected.project, "Timestamped correction");
    });
  });

  describe("the performing contributor corrects performingEmployee", () => {
    test("the performing-program-manager approver may name it, and the authorization stays put", () => {
      const authorization = reachPerformingProgramManager("Employee typo");
      const requested = service.requestCorrection(
        { participantId: performingApproverA },
        authorization.id,
        { fields: ["performingEmployee"], comment: "Misspelled the employee's name." },
      );
      assert.equal(requested.currentStageId, "performing-program-manager");
      assert.equal(requested.awaitingCorrection, true);
    });

    test("sits in the claiming contributor's queue, not the submitter's", () => {
      const authorization = reachPerformingProgramManager("Contributor's queue");
      service.requestCorrection({ participantId: performingApproverA }, authorization.id, {
        fields: ["performingEmployee"],
        comment: "Wrong employee.",
      });

      const contributorQueue = service.listMyQueue({ participantId: contributorAtPerformingDept });
      assert.ok(contributorQueue.some((a) => a.id === authorization.id));
      const submitterQueue = service.listMyQueue({ participantId: submitter });
      assert.ok(!submitterQueue.some((a) => a.id === authorization.id));
    });

    test("only the contributor who claimed it may correct performingEmployee", () => {
      const authorization = reachPerformingProgramManager("Not yours to correct");
      service.requestCorrection({ participantId: performingApproverA }, authorization.id, {
        fields: ["performingEmployee"],
        comment: "Wrong employee.",
      });

      assert.throws(
        () =>
          service.correct({ participantId: anotherContributorAtPerformingDept }, authorization.id, {
            performingEmployee: "Someone else",
          }),
        (err: unknown) => err instanceof DomainError && err.code === "NOT_CORRECTOR",
      );
      assert.throws(
        () =>
          service.correct({ participantId: submitter }, authorization.id, {
            performingEmployee: "Someone else",
          }),
        (err: unknown) => err instanceof DomainError && err.code === "NOT_CORRECTOR",
      );
    });

    test("the claimant corrects it, and the performing-program-manager approver resumes", () => {
      const authorization = reachPerformingProgramManager("Employee corrected");
      service.requestCorrection({ participantId: performingApproverA }, authorization.id, {
        fields: ["performingEmployee"],
        comment: "Wrong employee.",
      });

      const corrected = service.correct({ participantId: contributorAtPerformingDept }, authorization.id, {
        performingEmployee: "Corrected Employee",
      });
      assert.equal(corrected.performingEmployee, "Corrected Employee");
      assert.equal(corrected.currentStageId, "performing-program-manager");
      assert.equal(corrected.awaitingCorrection, false);

      const advanced = service.acknowledge({ participantId: performingApproverA }, authorization.id);
      assert.equal(advanced.currentStageId, "performing-finance");
    });
  });

  test("a Contributor at a different department sees none of this", () => {
    const authorization = reachPerformingProgramManager("Not this department's business");
    service.requestCorrection({ participantId: performingApproverA }, authorization.id, {
      fields: ["performingEmployee"],
      comment: "Wrong employee.",
    });
    const queue = service.listMyQueue({ participantId: contributorAtOtherDept });
    assert.ok(!queue.some((a) => a.id === authorization.id));
  });
});
