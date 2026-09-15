import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { createService } from "../../src/service/index.ts";
import { DomainError } from "../../src/service/errors.ts";
import { withTempStore } from "../helpers/temp-store.ts";

/**
 * Initiation (#54): a submitter releases a draft into the relay. This covers
 * the architectural heart ADR-0004, ADR-0009 and ADR-0011 land on -
 * completeness required at the point of release, the draft discharged
 * without a trace, one transition appended, and position folded from it
 * rather than stored. Not covered here: acknowledging past the first stage,
 * corrections, and re-review - all later tickets (#55 and beyond).
 */

describe("initiation", () => {
  let store: ReturnType<typeof withTempStore>;
  let service: ReturnType<typeof createService>;
  let submitter: string;
  let otherPerson: string;
  let requestingDeptId: string;
  let performingDeptId: string;

  before(() => {
    store = withTempStore();
    service = createService({ storePath: store.path });
    const people = service.listParticipants({ participantId: "system" });
    submitter = people[0]!.id;
    otherPerson = people[1]!.id;

    const departments = service.searchDepartments({ participantId: "system" });
    requestingDeptId = departments[0]!.id;
    performingDeptId = departments[1]!.id;
  });
  after(() => {
    service.close();
    store.cleanup();
  });

  function draftCompleteFields() {
    return {
      project: "Rotor recertification",
      requestingDepartmentId: requestingDeptId,
      performingDepartmentId: performingDeptId,
      fundingType: "company-funded" as const,
      requestingLocationType: "domestic" as const,
      performingLocationType: "domestic" as const,
      requestingProgramManager: "Dana Ferris",
      requestingFinanceApprover: "Kim Osei",
      performingProgramManager: "Lior Amsel",
      performingFinanceApprover: "Priya Nandan",
    };
  }

  function createCompleteDraft() {
    const draft = service.createDraft({ participantId: submitter }, draftCompleteFields());
    service.addResource({ participantId: submitter }, draft.id, { budgetHours: 40, laborRate: 85.5 });
    return draft;
  }

  test("an incomplete draft is refused at initiation", () => {
    const draft = service.createDraft({ participantId: submitter }, { project: "Half-filled" });
    assert.throws(
      () => service.initiateDraft({ participantId: submitter }, draft.id),
      (err: unknown) => {
        assert.ok(err instanceof DomainError);
        assert.equal(err.code, "DRAFT_INCOMPLETE");
        return true;
      },
    );
  });

  test("a complete draft with no resources is refused at initiation", () => {
    const draft = service.createDraft({ participantId: submitter }, draftCompleteFields());
    assert.throws(
      () => service.initiateDraft({ participantId: submitter }, draft.id),
      (err: unknown) => err instanceof DomainError && err.code === "DRAFT_INCOMPLETE",
    );
  });

  test("only the submitter may initiate their draft", () => {
    const draft = createCompleteDraft();
    assert.throws(
      () => service.initiateDraft({ participantId: otherPerson }, draft.id),
      (err: unknown) => err instanceof DomainError && err.code === "NOT_DRAFT_OWNER",
    );
  });

  test("initiating a complete draft appends the first transition and discharges the draft", () => {
    const draft = createCompleteDraft();

    const authorization = service.initiateDraft({ participantId: submitter }, draft.id);

    assert.equal(authorization.submitterId, submitter);
    assert.equal(authorization.project, "Rotor recertification");
    assert.equal(authorization.requestingDepartmentId, requestingDeptId);
    assert.equal(authorization.performingDepartmentId, performingDeptId);
    assert.equal(authorization.resources.length, 1);
    assert.equal(authorization.resources[0]!.budgetHours, 40);
    // Reports which stage it sits at - the relay's first entry, immediately.
    assert.equal(authorization.currentStageId, "requesting-program-manager");
    assert.ok(authorization.initiatedAt.length > 0);

    // The draft is discharged: gone from the seam exactly as a delete would
    // leave it.
    assert.throws(
      () => service.getDraft({ participantId: submitter }, draft.id),
      (err: unknown) => err instanceof DomainError && err.code === "UNKNOWN_DRAFT",
    );
    assert.ok(!service.listMyDrafts({ participantId: submitter }).some((d) => d.id === draft.id));
  });

  test("a resource's id is carried from the draft into the authorization", () => {
    const draft = service.createDraft({ participantId: submitter }, draftCompleteFields());
    const withResource = service.addResource({ participantId: submitter }, draft.id, {
      budgetHours: 12,
      laborRate: 60,
    });
    const resourceId = withResource.resources[0]!.id;

    const authorization = service.initiateDraft({ participantId: submitter }, draft.id);
    assert.equal(authorization.resources[0]!.id, resourceId);
  });

  test("the initiated authorization is readable back by its id, by anyone (BDR-0007)", () => {
    const draft = createCompleteDraft();
    const authorization = service.initiateDraft({ participantId: submitter }, draft.id);

    const reread = service.getAuthorization({ participantId: otherPerson }, authorization.id);
    assert.deepEqual(reread, authorization);
  });

  test("an unknown authorization id is refused", () => {
    assert.throws(
      () => service.getAuthorization({ participantId: submitter }, "authorization-nope"),
      (err: unknown) => err instanceof DomainError && err.code === "UNKNOWN_AUTHORIZATION",
    );
  });

  test("the timestamp defaults from the clock when the caller supplies none", () => {
    const draft = createCompleteDraft();
    const before = new Date();
    const authorization = service.initiateDraft({ participantId: submitter }, draft.id);
    const after = new Date();

    const initiatedAt = new Date(authorization.initiatedAt);
    assert.ok(initiatedAt >= before && initiatedAt <= after);
  });

  test("the caller may supply the transition's timestamp instead", () => {
    const draft = createCompleteDraft();
    const suppliedTimestamp = "2026-01-15T09:30:00.000Z";

    const authorization = service.initiateDraft(
      { participantId: submitter },
      draft.id,
      { occurredAt: suppliedTimestamp },
    );
    assert.equal(authorization.initiatedAt, suppliedTimestamp);
  });

  test("a malformed timestamp is refused", () => {
    const draft = createCompleteDraft();
    assert.throws(
      () => service.initiateDraft({ participantId: submitter }, draft.id, { occurredAt: "not-a-date" }),
      (err: unknown) => err instanceof DomainError && err.code === "INVALID_REQUEST",
    );
  });

  test("the transition log carries the actor, the kind, and the timestamp - and nothing is ever updated", () => {
    const draft = createCompleteDraft();
    const authorization = service.initiateDraft({ participantId: submitter }, draft.id);

    const raw = new DatabaseSync(store.path);
    try {
      const rows = raw
        .prepare("SELECT kind, actor_id, occurred_at FROM transitions WHERE authorization_id = ?")
        .all(authorization.id) as { kind: string; actor_id: string; occurred_at: string }[];
      assert.equal(rows.length, 1);
      assert.equal(rows[0]!.kind, "initiation");
      assert.equal(rows[0]!.actor_id, submitter);
      assert.equal(rows[0]!.occurred_at, authorization.initiatedAt);
    } finally {
      raw.close();
    }
  });

  test("resetting the store succeeds after an authorization has been initiated", () => {
    const draft = createCompleteDraft();
    service.initiateDraft({ participantId: submitter }, draft.id);
    const info = service.resetStore({ participantId: "system" });
    assert.ok(info.participantCount > 0);
  });
});
