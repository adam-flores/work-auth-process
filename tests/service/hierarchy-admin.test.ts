import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { createService } from "../../src/service/index.ts";
import { DomainError } from "../../src/service/errors.ts";
import { withTempStore } from "../helpers/temp-store.ts";

/**
 * The Administrator maintaining the hierarchy (#64, BDR-0010): add, rename
 * and set-inactive for a legal entity, a division or a department, plus the
 * consequence hanging off one of them - marking a department inactive (or a
 * division or legal entity above it) revokes every in-flight authorization
 * naming a department that closes as a result, each as an ordinary
 * revocation transition with a system-supplied comment, and notifies the
 * submitter. Nothing here is ever deleted, and re-parenting is specified
 * (BDR-0010) and deliberately not built.
 */

const SYSTEM = { participantId: "system" };

describe("hierarchy maintenance", () => {
  let store: ReturnType<typeof withTempStore>;
  let service: ReturnType<typeof createService>;
  let administrator: { participantId: string };
  let submitter: string;
  let anotherSubmitter: string;
  let contributor: { participantId: string };
  let requestingApprover: string;
  let requestingDeptId: string;

  before(() => {
    store = withTempStore();
    service = createService({ storePath: store.path });

    const people = service.listParticipants(SYSTEM);
    administrator = { participantId: people.find((p) => p.role === "Administrator")!.id };
    submitter = people.find((p) => p.id === "p-marcus-oduya")!.id;
    anotherSubmitter = people.find((p) => p.id === "p-elin-vasquez")!.id;
    contributor = { participantId: people.find((p) => p.role === "Contributor")!.id };
    requestingApprover = people.find((p) => p.id === "p-priya-anand")!.id;

    requestingDeptId = service.searchDepartments(SYSTEM, {}).find((d) => d.name === "Rotor Assemblies")!.id;
  });
  after(() => {
    service.close();
    store.cleanup();
  });

  /** A fresh three-level branch, added through the same command surface
   *  under test - every destructive test (set-inactive has no reactivate,
   *  by design) gets its own department rather than reaching for the
   *  seeded fixture, so tests never depend on run order or need to undo a
   *  closure nothing here can reverse. */
  function addFreshDepartment(label: string) {
    const legalEntity = service.addHierarchyNode(administrator, { nodeKind: "legal-entity", name: `${label} LE` });
    const division = service.addHierarchyNode(administrator, {
      nodeKind: "division",
      name: `${label} Division`,
      legalEntityId: legalEntity.id,
    });
    const department = service.addHierarchyNode(administrator, {
      nodeKind: "department",
      name: `${label} Department`,
      divisionId: division.id,
    });
    return { legalEntity, division, department };
  }

  function initiateAuthorization(project: string, performingDepartmentId: string) {
    const draft = service.createDraft(
      { participantId: submitter },
      {
        project,
        requestingDepartmentId: requestingDeptId,
        performingDepartmentId,
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

  describe("adding", () => {
    test("an Administrator adds a legal entity, a division under it, and a department under that", () => {
      const { legalEntity, division, department } = addFreshDepartment("Add path");
      assert.equal(legalEntity.active, true);
      assert.equal(division.active, true);
      assert.equal(department.active, true);

      const resolved = service.getDepartment(SYSTEM, department.id);
      assert.equal(resolved.name, "Add path Department");
      assert.equal(resolved.division.id, division.id);
      assert.equal(resolved.legalEntity.id, legalEntity.id);
      assert.equal(resolved.selectable, true);
    });

    test("only an Administrator may add a node - reading the hierarchy stays open", () => {
      assert.throws(
        () => service.addHierarchyNode(contributor, { nodeKind: "legal-entity", name: "Nope Inc" }),
        (err: unknown) => err instanceof DomainError && err.code === "NOT_ADMINISTRATOR",
      );
    });

    test("a division named against an unknown legal entity is refused", () => {
      assert.throws(
        () =>
          service.addHierarchyNode(administrator, {
            nodeKind: "division",
            name: "Orphan Division",
            legalEntityId: "no-such-legal-entity",
          }),
        (err: unknown) => err instanceof DomainError && err.code === "UNKNOWN_HIERARCHY_NODE",
      );
    });

    test("a department named against an unknown division is refused", () => {
      assert.throws(
        () =>
          service.addHierarchyNode(administrator, {
            nodeKind: "department",
            name: "Orphan Department",
            divisionId: "no-such-division",
          }),
        (err: unknown) => err instanceof DomainError && err.code === "UNKNOWN_HIERARCHY_NODE",
      );
    });

    test("a division may not be added under a closed legal entity", () => {
      const { legalEntity } = addFreshDepartment("Closed parent - LE");
      service.setHierarchyNodeInactive(administrator, "legal-entity", legalEntity.id);
      assert.throws(
        () =>
          service.addHierarchyNode(administrator, {
            nodeKind: "division",
            name: "Division under closed LE",
            legalEntityId: legalEntity.id,
          }),
        (err: unknown) => err instanceof DomainError && err.code === "HIERARCHY_NODE_INACTIVE",
      );
    });

    test("a department may not be added under a closed division", () => {
      const { division } = addFreshDepartment("Closed parent - division");
      service.setHierarchyNodeInactive(administrator, "division", division.id);
      assert.throws(
        () =>
          service.addHierarchyNode(administrator, {
            nodeKind: "department",
            name: "Department under closed division",
            divisionId: division.id,
          }),
        (err: unknown) => err instanceof DomainError && err.code === "HIERARCHY_NODE_INACTIVE",
      );
    });

    test("a name that is punctuation only still gets a usable, distinct id", () => {
      const first = service.addHierarchyNode(administrator, { nodeKind: "legal-entity", name: "—" });
      const second = service.addHierarchyNode(administrator, { nodeKind: "legal-entity", name: "—" });
      assert.ok(first.id.length > 0);
      assert.notEqual(first.id, second.id);
      // Reachable through the ordinary mutating surface, not stranded.
      const renamed = service.renameHierarchyNode(administrator, "legal-entity", first.id, {
        name: "No longer punctuation",
      });
      assert.equal(renamed.name, "No longer punctuation");
    });

    test("a blank name is refused", () => {
      assert.throws(
        () => service.addHierarchyNode(administrator, { nodeKind: "legal-entity", name: "   " }),
        (err: unknown) => err instanceof DomainError && err.code === "INVALID_REQUEST",
      );
    });

    test("two departments named alike get distinct ids rather than colliding", () => {
      const division = service.addHierarchyNode(administrator, {
        nodeKind: "division",
        name: "Collision Division",
        legalEntityId: addFreshDepartment("Collision host").legalEntity.id,
      });
      const first = service.addHierarchyNode(administrator, {
        nodeKind: "department",
        name: "Twin Department",
        divisionId: division.id,
      });
      const second = service.addHierarchyNode(administrator, {
        nodeKind: "department",
        name: "Twin Department",
        divisionId: division.id,
      });
      assert.notEqual(first.id, second.id);
      assert.equal(service.getDepartment(SYSTEM, first.id).name, "Twin Department");
      assert.equal(service.getDepartment(SYSTEM, second.id).name, "Twin Department");
    });
  });

  describe("renaming", () => {
    test("an Administrator renames a department, and it does not disturb in-flight work", () => {
      const { department } = addFreshDepartment("Rename target");
      const authorization = initiateAuthorization("Renamed mid-flight", department.id);

      const renamed = service.renameHierarchyNode(administrator, "department", department.id, {
        name: "Renamed Department",
      });
      assert.equal(renamed.name, "Renamed Department");

      // Still live, still in the requesting approver's queue, and not
      // revoked - BDR-0010: "a rename does not cancel."
      const stillLive = service.getAuthorization(SYSTEM, authorization.id);
      assert.equal(stillLive.revokedAt, null);
      assert.equal(stillLive.currentStageId, authorization.currentStageId);
      assert.ok(service.listMyQueue({ participantId: requestingApprover }).some((a) => a.id === authorization.id));

      // The classification resolves live and reflects the new name.
      const classification = service.getClassification(SYSTEM, authorization.id);
      assert.equal(classification.performing.department.name, "Renamed Department");
    });

    test("renaming a legal entity or a division works the same way", () => {
      const { legalEntity, division } = addFreshDepartment("Rename levels");
      const renamedEntity = service.renameHierarchyNode(administrator, "legal-entity", legalEntity.id, {
        name: "Renamed Legal Entity",
      });
      assert.equal(renamedEntity.name, "Renamed Legal Entity");

      const renamedDivision = service.renameHierarchyNode(administrator, "division", division.id, {
        name: "Renamed Division",
      });
      assert.equal(renamedDivision.name, "Renamed Division");
    });

    test("only an Administrator may rename", () => {
      const { department } = addFreshDepartment("Rename gate");
      assert.throws(
        () => service.renameHierarchyNode(contributor, "department", department.id, { name: "Hijacked" }),
        (err: unknown) => err instanceof DomainError && err.code === "NOT_ADMINISTRATOR",
      );
    });

    test("renaming an unknown node is refused", () => {
      assert.throws(
        () => service.renameHierarchyNode(administrator, "department", "no-such-department", { name: "Ghost" }),
        (err: unknown) => err instanceof DomainError && err.code === "UNKNOWN_HIERARCHY_NODE",
      );
    });

    test("renaming to the same name changes nothing and logs nothing", () => {
      const { department } = addFreshDepartment("Rename no-op");
      const before = service.listHierarchyChanges(administrator).length;
      service.renameHierarchyNode(administrator, "department", department.id, {
        name: department.name,
      });
      assert.equal(service.listHierarchyChanges(administrator).length, before);
    });
  });

  describe("setting inactive, and the revocation fan-out", () => {
    test("setting a department inactive closes it to new authorizations but keeps it resolvable", () => {
      const { department } = addFreshDepartment("Close target");
      const closed = service.setHierarchyNodeInactive(administrator, "department", department.id);
      assert.equal(closed.active, false);

      const resolved = service.getDepartment(SYSTEM, department.id);
      assert.equal(resolved.active, false);
      assert.equal(resolved.selectable, false);
      assert.equal(resolved.name, department.name, "closed, not renamed or removed");
    });

    test("it revokes every in-flight authorization naming the department, with a system-supplied comment", () => {
      const { department } = addFreshDepartment("Revoke target");
      const authorization = initiateAuthorization("Revoked by hierarchy change", department.id);
      assert.ok(service.listMyQueue({ participantId: requestingApprover }).some((a) => a.id === authorization.id));

      service.setHierarchyNodeInactive(administrator, "department", department.id);

      const revoked = service.getAuthorization(SYSTEM, authorization.id);
      assert.ok(revoked.revokedAt, "should carry a revocation timestamp");
      assert.ok(revoked.revocationComment && revoked.revocationComment.length > 0);

      // Left in nobody's queue.
      assert.ok(!service.listMyQueue({ participantId: requestingApprover }).some((a) => a.id === authorization.id));
    });

    test("the revocation's comment is the system's own, not typed by the Administrator", () => {
      const { department } = addFreshDepartment("Comment target");
      const authorization = initiateAuthorization("Comment check", department.id);
      service.setHierarchyNodeInactive(administrator, "department", department.id);

      const revoked = service.getAuthorization(SYSTEM, authorization.id);
      // The Administrator's call above named nothing but the node - there is
      // no comment parameter on the command at all, so whatever the record
      // carries came from the system.
      assert.match(revoked.revocationComment ?? "", /closed by a hierarchy change/i);
    });

    test("a revoked authorization freezes its classification, like every other terminal transition", () => {
      const { department, division, legalEntity } = addFreshDepartment("Freeze target");
      const authorization = initiateAuthorization("Freeze check", department.id);
      service.setHierarchyNodeInactive(administrator, "department", department.id);

      const classification = service.getClassification(SYSTEM, authorization.id);
      assert.equal(classification.performing.department.id, department.id);
      assert.equal(classification.performing.division.id, division.id);
      assert.equal(classification.performing.legalEntity.id, legalEntity.id);

      // Frozen: renaming the (now inactive) department afterwards does not
      // reach the settled record.
      service.renameHierarchyNode(administrator, "department", department.id, { name: "Renamed after revoke" });
      const stillFrozen = service.getClassification(SYSTEM, authorization.id);
      assert.equal(stillFrozen.performing.department.name, department.name);
    });

    test("the affected submitter is notified - the one case someone is told about an authorization leaving without them", () => {
      const { department } = addFreshDepartment("Notify target");
      const authorization = initiateAuthorization("Notify me", department.id);

      assert.ok(!service.listMyRevocations({ participantId: submitter }).some((a) => a.id === authorization.id));
      service.setHierarchyNodeInactive(administrator, "department", department.id);

      const notices = service.listMyRevocations({ participantId: submitter });
      assert.ok(notices.some((a) => a.id === authorization.id));
      // Nobody else's notice list carries it.
      assert.ok(!service.listMyRevocations({ participantId: anotherSubmitter }).some((a) => a.id === authorization.id));
    });

    test("an authorization naming a department that was not closed is untouched", () => {
      const closing = addFreshDepartment("Untouched control - closing");
      const surviving = addFreshDepartment("Untouched control - surviving");
      const untouched = initiateAuthorization("Should survive", surviving.department.id);
      initiateAuthorization("Should be revoked", closing.department.id);

      service.setHierarchyNodeInactive(administrator, "department", closing.department.id);

      const stillLive = service.getAuthorization(SYSTEM, untouched.id);
      assert.equal(stillLive.revokedAt, null);
    });

    test("closing a division revokes in-flight work for every department beneath it", () => {
      const { division, department } = addFreshDepartment("Division cascade");
      const authorization = initiateAuthorization("Cascaded from division", department.id);

      service.setHierarchyNodeInactive(administrator, "division", division.id);

      const revoked = service.getAuthorization(SYSTEM, authorization.id);
      assert.ok(revoked.revokedAt, "closing the division above it should revoke this authorization too");

      const resolvedDept = service.getDepartment(SYSTEM, department.id);
      assert.equal(resolvedDept.active, true, "the department's own flag never changed");
      assert.equal(resolvedDept.selectable, false, "closed by the division above it");
    });

    test("closing a legal entity cascades the same way, two levels down", () => {
      const { legalEntity, department } = addFreshDepartment("Entity cascade");
      const authorization = initiateAuthorization("Cascaded from legal entity", department.id);

      service.setHierarchyNodeInactive(administrator, "legal-entity", legalEntity.id);

      assert.ok(service.getAuthorization(SYSTEM, authorization.id).revokedAt);
    });

    test("a draft naming the closed department is untouched - it is not in the relay for a hierarchy change to reach", () => {
      const { department } = addFreshDepartment("Draft target");
      const draft = service.createDraft(
        { participantId: submitter },
        { performingDepartmentId: department.id },
      );

      service.setHierarchyNodeInactive(administrator, "department", department.id);

      const stillThere = service.getDraft({ participantId: submitter }, draft.id);
      assert.equal(stillThere.performingDepartmentId, department.id);
    });

    test("setting an already-inactive node inactive again is a no-op - no re-revocation, nothing new logged", () => {
      const { department } = addFreshDepartment("Idempotent target");
      const authorization = initiateAuthorization("Revoked once", department.id);
      service.setHierarchyNodeInactive(administrator, "department", department.id);
      const revokedAt = service.getAuthorization(SYSTEM, authorization.id).revokedAt;

      const changesBefore = service.listHierarchyChanges(administrator).length;
      service.setHierarchyNodeInactive(administrator, "department", department.id);

      assert.equal(service.getAuthorization(SYSTEM, authorization.id).revokedAt, revokedAt);
      assert.equal(service.listHierarchyChanges(administrator).length, changesBefore);
    });

    test("only an Administrator may set a node inactive", () => {
      const { department } = addFreshDepartment("Set-inactive gate");
      assert.throws(
        () => service.setHierarchyNodeInactive(contributor, "department", department.id),
        (err: unknown) => err instanceof DomainError && err.code === "NOT_ADMINISTRATOR",
      );
    });

    test("setting an unknown node inactive is refused", () => {
      assert.throws(
        () => service.setHierarchyNodeInactive(administrator, "department", "no-such-department"),
        (err: unknown) => err instanceof DomainError && err.code === "UNKNOWN_HIERARCHY_NODE",
      );
    });

    test("nothing is deleted: the department count only grows", () => {
      const before = service.getStoreInfo(SYSTEM).departmentCount;
      const { department } = addFreshDepartment("Count check");
      service.setHierarchyNodeInactive(administrator, "department", department.id);
      assert.equal(service.getStoreInfo(SYSTEM).departmentCount, before + 1);
    });

    test("a revoked authorization cannot be acted on by an id that outlives its own queue membership", () => {
      // Revoking does not move `currentStageId`, so the ordinary
      // queue-membership checks (`isQueuedFor`, `isHolderOf`) would still
      // say this authorization belongs to these participants unless the
      // command surface itself refuses a terminal record first.
      const { department } = addFreshDepartment("Terminal after revoke");
      const authorization = initiateAuthorization("Cannot be acted on once revoked", department.id);
      service.setHierarchyNodeInactive(administrator, "department", department.id);

      assert.throws(
        () => service.acknowledge({ participantId: requestingApprover }, authorization.id),
        (err: unknown) => err instanceof DomainError && err.code === "AUTHORIZATION_TERMINAL",
      );
      assert.throws(
        () =>
          service.refer({ participantId: requestingApprover }, authorization.id, {
            colleagueId: contributor.participantId,
          }),
        (err: unknown) => err instanceof DomainError && err.code === "AUTHORIZATION_TERMINAL",
      );
      assert.throws(
        () =>
          service.requestCorrection({ participantId: requestingApprover }, authorization.id, {
            fields: ["project"],
            comment: "Too late",
          }),
        (err: unknown) => err instanceof DomainError && err.code === "AUTHORIZATION_TERMINAL",
      );
    });
  });

  describe("the change log", () => {
    test("records an add, a rename and a set-inactive, each with actor and timestamp", () => {
      const { department } = addFreshDepartment("Log target");
      service.renameHierarchyNode(administrator, "department", department.id, { name: "Logged Rename" });
      service.setHierarchyNodeInactive(administrator, "department", department.id);

      const changes = service.listHierarchyChanges(administrator);
      const forThisDepartment = changes.filter((c) => c.nodeId === department.id);
      assert.deepEqual(
        forThisDepartment.map((c) => c.kind),
        ["add", "rename", "set-inactive"],
      );
      for (const change of forThisDepartment) {
        assert.equal(change.actorId, administrator.participantId);
        assert.ok(change.occurredAt);
      }
    });

    test("is its own log, separate from the transition log", () => {
      const { department } = addFreshDepartment("Separate log");
      const authorization = initiateAuthorization("Not a hierarchy change", department.id);
      const beforeChanges = service.listHierarchyChanges(administrator).length;

      service.acknowledge({ participantId: requestingApprover }, authorization.id);

      // An ordinary authorization transition adds nothing to the hierarchy's
      // own log.
      assert.equal(service.listHierarchyChanges(administrator).length, beforeChanges);
    });

    test("is visible to the Administrator only", () => {
      assert.throws(
        () => service.listHierarchyChanges(contributor),
        (err: unknown) => err instanceof DomainError && err.code === "NOT_ADMINISTRATOR",
      );
    });
  });

  describe("reading the hierarchy for the admin surface", () => {
    test("legal entities and divisions are listed even before any department is added beneath them", () => {
      const legalEntity = service.addHierarchyNode(administrator, {
        nodeKind: "legal-entity",
        name: "Empty-branch LE",
      });
      const division = service.addHierarchyNode(administrator, {
        nodeKind: "division",
        name: "Empty-branch Division",
        legalEntityId: legalEntity.id,
      });

      assert.ok(service.listLegalEntities(SYSTEM).some((e) => e.id === legalEntity.id));
      assert.ok(service.listDivisions(SYSTEM).some((d) => d.id === division.id));
      assert.deepEqual(
        service.listDivisions(SYSTEM, legalEntity.id).map((d) => d.id),
        [division.id],
      );
    });
  });
});
