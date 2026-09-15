import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { createService } from "../../src/service/index.ts";
import { DomainError } from "../../src/service/errors.ts";
import { withTempStore } from "../helpers/temp-store.ts";

/**
 * A draft (#51, ADR-0009): mutable state, no history, gone without a trace
 * however it ends. Not covered here: completeness at initiation (#52) and
 * permissibility (#53) - both are blocked by this ticket rather than part
 * of it.
 */

describe("drafts", () => {
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

  test("a submitter creates a draft naming nothing, and it appears in their own queue", () => {
    const draft = service.createDraft({ participantId: submitter });
    assert.equal(draft.submitterId, submitter);
    assert.equal(draft.project, null);
    assert.deepEqual(draft.resources, []);

    const mine = service.listMyDrafts({ participantId: submitter });
    assert.ok(mine.some((d) => d.id === draft.id));
  });

  test("the system identity cannot submit a draft", () => {
    assert.throws(
      () => service.createDraft({ participantId: "system" }),
      (err: unknown) => {
        assert.ok(err instanceof DomainError);
        assert.equal(err.code, "INVALID_REQUEST");
        return true;
      },
    );
  });

  test("a draft is not in someone else's queue", () => {
    const draft = service.createDraft({ participantId: submitter });
    const theirs = service.listMyDrafts({ participantId: otherPerson });
    assert.ok(!theirs.some((d) => d.id === draft.id));
  });

  test("a draft can be created with fields, naming both departments through the picker", () => {
    const draft = service.createDraft(
      { participantId: submitter },
      {
        project: "Rotor recertification",
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
    assert.equal(draft.project, "Rotor recertification");
    assert.equal(draft.requestingDepartmentId, requestingDeptId);
    assert.equal(draft.performingDepartmentId, performingDeptId);
    assert.equal(draft.fundingType, "company-funded");
  });

  test("the requesting and performing department may not be the same", () => {
    assert.throws(
      () =>
        service.createDraft(
          { participantId: submitter },
          { requestingDepartmentId: requestingDeptId, performingDepartmentId: requestingDeptId },
        ),
      (err: unknown) => {
        assert.ok(err instanceof DomainError);
        assert.equal(err.code, "INVALID_REQUEST");
        return true;
      },
    );
  });

  test("a department id that does not resolve is refused", () => {
    assert.throws(
      () =>
        service.createDraft(
          { participantId: submitter },
          { requestingDepartmentId: "not-a-real-department" },
        ),
      (err: unknown) => {
        assert.ok(err instanceof DomainError);
        assert.equal(err.code, "UNKNOWN_DEPARTMENT");
        return true;
      },
    );
  });

  test("a literal null body is refused rather than treated as an empty draft", () => {
    assert.throws(
      () => service.createDraft({ participantId: submitter }, null as unknown as undefined),
      (err: unknown) => err instanceof DomainError && err.code === "INVALID_REQUEST",
    );
  });

  test("a literal null body on save is refused rather than silently clearing the draft", () => {
    const draft = service.createDraft({ participantId: submitter }, { project: "Do not clear me" });
    assert.throws(
      () => service.updateDraft({ participantId: submitter }, draft.id, null as unknown as object),
      (err: unknown) => err instanceof DomainError && err.code === "INVALID_REQUEST",
    );
    // Refused, not partially applied - the draft is exactly as it was.
    assert.equal(service.getDraft({ participantId: submitter }, draft.id).project, "Do not clear me");
  });

  test("a name field present but blank is refused rather than silently kept", () => {
    assert.throws(
      () => service.createDraft({ participantId: submitter }, { requestingProgramManager: "   " }),
      (err: unknown) => {
        assert.ok(err instanceof DomainError);
        assert.equal(err.code, "INVALID_REQUEST");
        return true;
      },
    );
  });

  test("saving a draft replaces its whole contents, and reopening it reads the same values back", () => {
    const draft = service.createDraft({ participantId: submitter }, { project: "First pass" });

    const saved = service.updateDraft({ participantId: submitter }, draft.id, {
      project: "Second pass",
      requestingDepartmentId: requestingDeptId,
    });
    assert.equal(saved.project, "Second pass");
    assert.equal(saved.requestingDepartmentId, requestingDeptId);

    const reopened = service.getDraft({ participantId: otherPerson }, draft.id);
    assert.equal(reopened.project, "Second pass");
    assert.equal(reopened.requestingDepartmentId, requestingDeptId);
    // A field left out of the save is cleared, not carried over - the draft
    // is saved as a whole (ADR-0009), not patched field by field.
    assert.equal(reopened.performingDepartmentId, null);
  });

  test("only the submitter may save over their draft", () => {
    const draft = service.createDraft({ participantId: submitter });
    assert.throws(
      () => service.updateDraft({ participantId: otherPerson }, draft.id, { project: "Hijacked" }),
      (err: unknown) => {
        assert.ok(err instanceof DomainError);
        assert.equal(err.code, "NOT_DRAFT_OWNER");
        return true;
      },
    );
  });

  test("resources are added and removed freely while the draft stands", () => {
    const draft = service.createDraft({ participantId: submitter });

    const withOne = service.addResource({ participantId: submitter }, draft.id, {
      budgetHours: 40,
      laborRate: 85.5,
    });
    assert.equal(withOne.resources.length, 1);
    assert.equal(withOne.resources[0]!.budgetHours, 40);
    assert.equal(withOne.resources[0]!.laborRate, 85.5);

    const withTwo = service.addResource({ participantId: submitter }, draft.id, {
      budgetHours: 12,
      laborRate: 60,
    });
    assert.equal(withTwo.resources.length, 2);

    const withOneAgain = service.removeResource(
      { participantId: submitter },
      draft.id,
      withTwo.resources[0]!.id,
    );
    assert.equal(withOneAgain.resources.length, 1);
    assert.equal(withOneAgain.resources[0]!.id, withTwo.resources[1]!.id);
  });

  test("a non-positive budget or rate is refused", () => {
    const draft = service.createDraft({ participantId: submitter });
    assert.throws(
      () => service.addResource({ participantId: submitter }, draft.id, { budgetHours: 0, laborRate: 10 }),
      (err: unknown) => err instanceof DomainError && err.code === "INVALID_REQUEST",
    );
  });

  test("removing an unknown resource is refused", () => {
    const draft = service.createDraft({ participantId: submitter });
    assert.throws(
      () => service.removeResource({ participantId: submitter }, draft.id, "resource-nope"),
      (err: unknown) => err instanceof DomainError && err.code === "UNKNOWN_RESOURCE",
    );
  });

  test("only the submitter may add or remove a resource", () => {
    const draft = service.createDraft({ participantId: submitter });
    assert.throws(
      () => service.addResource({ participantId: otherPerson }, draft.id, { budgetHours: 1, laborRate: 1 }),
      (err: unknown) => err instanceof DomainError && err.code === "NOT_DRAFT_OWNER",
    );
  });

  test("a submitter deletes their own draft, and it leaves no trace", () => {
    const draft = service.createDraft({ participantId: submitter }, { project: "Throwaway" });
    service.addResource({ participantId: submitter }, draft.id, { budgetHours: 5, laborRate: 5 });

    const result = service.deleteDraft({ participantId: submitter }, draft.id);
    assert.deepEqual(result, { deleted: true });

    assert.throws(
      () => service.getDraft({ participantId: submitter }, draft.id),
      (err: unknown) => err instanceof DomainError && err.code === "UNKNOWN_DRAFT",
    );
    assert.ok(!service.listMyDrafts({ participantId: submitter }).some((d) => d.id === draft.id));

    // Not just unreachable through the seam - the resource row is gone too,
    // not merely orphaned.
    const raw = new DatabaseSync(store.path);
    try {
      const remaining = raw.prepare("SELECT COUNT(*) AS n FROM draft_resources WHERE draft_id = ?").get(
        draft.id,
      ) as { n: number };
      assert.equal(remaining.n, 0);
    } finally {
      raw.close();
    }
  });

  test("only the submitter may delete their draft", () => {
    const draft = service.createDraft({ participantId: submitter });
    assert.throws(
      () => service.deleteDraft({ participantId: otherPerson }, draft.id),
      (err: unknown) => err instanceof DomainError && err.code === "NOT_DRAFT_OWNER",
    );
  });

  test("a draft untouched for a month is removed by the system, without being told to", () => {
    const draft = service.createDraft({ participantId: submitter }, { project: "Forgotten" });

    const monthAndADayAgo = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
    service.__unsafeRawExec(
      `UPDATE drafts SET updated_at = '${monthAndADayAgo}' WHERE id = '${draft.id}'`,
    );

    // Nobody expires it directly - it disappears as the side effect of any
    // ordinary draft command running afterward.
    assert.ok(!service.listMyDrafts({ participantId: submitter }).some((d) => d.id === draft.id));
    assert.throws(
      () => service.getDraft({ participantId: submitter }, draft.id),
      (err: unknown) => err instanceof DomainError && err.code === "UNKNOWN_DRAFT",
    );
  });

  test("resetting the store succeeds even while a draft names a real participant and a department", () => {
    service.createDraft(
      { participantId: submitter },
      { project: "Still here when the store reseeds", requestingDepartmentId: requestingDeptId },
    );
    // Reseeding deletes and reinserts every participant and the whole
    // hierarchy under the same deterministic ids; it must not trip the
    // foreign keys a draft holds on either.
    const info = service.resetStore({ participantId: "system" });
    assert.ok(info.participantCount > 0);
  });

  test("a draft touched recently survives", () => {
    const draft = service.createDraft({ participantId: submitter }, { project: "Still active" });
    const aWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    service.__unsafeRawExec(`UPDATE drafts SET updated_at = '${aWeekAgo}' WHERE id = '${draft.id}'`);

    const reread = service.getDraft({ participantId: submitter }, draft.id);
    assert.equal(reread.id, draft.id);
  });
});
