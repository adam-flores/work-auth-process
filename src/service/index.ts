import { openStore, DEFAULT_STORE_PATH } from "../store/index.ts";
import {
  ActingParticipant,
  CompleteDraftFields,
  DepartmentQuery,
  DraftFields,
  HierarchyId,
  PermissibilityRuleInput,
  ResourceInput,
  TransitionOptions,
  SYSTEM_PARTICIPANT_ID,
} from "../shared/rules.ts";
import type {
  DepartmentQueryInput,
  DraftFieldsInput,
  Participant,
  TransitionOptionsInput,
} from "../shared/rules.ts";
import { findDepartments, resolveDepartment } from "../hierarchy/index.ts";
import type { ResolvedDepartment } from "../hierarchy/index.ts";
import {
  addPermissibilityRule as addRule,
  isPairingPermitted,
  listPermissibilityRules as listRules,
  permissibilityRuleExists,
  removePermissibilityRule as removeRule,
} from "../permissibility/index.ts";
import type { PermissibilityRule } from "../permissibility/index.ts";
import {
  addResource as addDraftResource,
  deleteDraftRows,
  findDraft,
  insertDraft,
  listDraftsBySubmitter,
  purgeExpiredDrafts,
  removeDraft,
  removeResource as removeDraftResource,
  replaceDraftFields,
  resourceExists,
} from "../drafts/index.ts";
import type { Draft, DraftFieldValues } from "../drafts/index.ts";
import {
  appendAcknowledgementTransition,
  appendInitiationTransition,
  findAuthorization,
} from "../authorizations/index.ts";
import type { Authorization, AuthorizationFields } from "../authorizations/index.ts";
import { isQueuedFor, listApproverQueue } from "../queues/index.ts";
import { DomainError } from "./errors.ts";

/**
 * The seam.
 *
 * Every process decision this product makes is reachable from here, as a typed
 * function taking the acting participant first (ADR-0010). Tests drive these
 * functions in-process against a real store; the HTTP layer is a thin adapter
 * over the same table and holds no logic of its own.
 */

export type StoreInfo = {
  schemaVersion: number;
  seededAt: string;
  participantCount: number;
  departmentCount: number;
};

export type ServiceOptions = { storePath?: string };

export function createService(options: ServiceOptions = {}) {
  const store = openStore(options.storePath ?? DEFAULT_STORE_PATH);
  const { db } = store;

  /** Validates who is acting. Not authentication - identity is mocked - but a
   *  command still may not name somebody who does not exist. */
  function requireParticipant(ctx: unknown): string {
    const parsed = ActingParticipant.safeParse(ctx);
    if (!parsed.success) {
      throw new DomainError("INVALID_REQUEST", parsed.error.issues[0]?.message ?? "Invalid request.");
    }
    const { participantId } = parsed.data;
    if (participantId === SYSTEM_PARTICIPANT_ID) return participantId;

    const found = db.prepare("SELECT id FROM participants WHERE id = ?").get(participantId);
    if (!found) {
      throw new DomainError("UNKNOWN_PARTICIPANT", `No participant with id "${participantId}".`);
    }
    return participantId;
  }

  /**
   * A draft needs a real, accountable submitter - `system` stands for the
   * product acting on its own behalf (constants.ts) and cannot own one, the
   * same way it holds no role and belongs to no department. Nothing else
   * checks this: every other draft command loads an existing draft and
   * checks the caller against *its* submitter, which by construction is
   * never `system` once creation refuses it.
   */
  function requireRealParticipant(ctx: unknown): string {
    const participantId = requireParticipant(ctx);
    if (participantId === SYSTEM_PARTICIPANT_ID) {
      throw new DomainError(
        "INVALID_REQUEST",
        "The system identity cannot submit a draft - act as a participant first.",
      );
    }
    return participantId;
  }

  /** The permissibility list is an Administrator's responsibility (BDR-0010,
   *  ADR-0011: "an Administrator maintains ... the permissibility rules") -
   *  the one command surface in this ticket where *who* is acting is
   *  load-bearing, not just *that* they exist. Reading the list stays open
   *  to everyone, the same as every other reference-data read; only adding
   *  and removing a pairing checks the role. */
  function requireAdministrator(ctx: unknown): string {
    const participantId = requireParticipant(ctx);
    const participant = db.prepare("SELECT role FROM participants WHERE id = ?").get(participantId) as
      | { role: string }
      | undefined;
    if (participant?.role !== "Administrator") {
      throw new DomainError("NOT_ADMINISTRATOR", "Only an Administrator may change the permissibility rules.");
    }
    return participantId;
  }

  /** A participant's role and department, or `undefined` for anyone not on
   *  the roster - `system` included, which is why queue membership checks
   *  read through this rather than assuming a match. */
  function readParticipant(participantId: string): { role: string; department: string } | undefined {
    return db.prepare("SELECT role, department FROM participants WHERE id = ?").get(participantId) as
      | { role: string; department: string }
      | undefined;
  }

  /** A department id a draft names has to resolve to something real - the
   *  same rule `getDepartment` already enforces, applied here because a
   *  draft can be written directly through this seam, not only through the
   *  picker that is the UI's only route to one. Returns the resolved
   *  department so the permissibility check below does not re-read it. */
  function resolveDepartmentIfSet(departmentId: string | null): ResolvedDepartment | null {
    if (!departmentId) return null;
    const found = resolveDepartment(db, departmentId);
    if (!found) {
      throw new DomainError("UNKNOWN_DEPARTMENT", `No department with id "${departmentId}".`);
    }
    return found;
  }

  /** #53: refused at entry, the moment both departments are set on a draft,
   *  rather than days later at a gate. Names the pairing - it is the
   *  pairing that is not permitted, not either department that is
   *  incapable of the work. */
  function requirePermissiblePairing(requesting: ResolvedDepartment, performing: ResolvedDepartment): void {
    if (isPairingPermitted(db, requesting, performing)) return;
    throw new DomainError(
      "IMPERMISSIBLE_PAIRING",
      `"${performing.name}" performing work for "${requesting.name}" is not a permitted pairing.`,
    );
  }

  /** `undefined` is the only "nothing given" this treats as an empty draft
   *  (`createDraft` called with no second argument, or a POST with no body
   *  at all) - a literal `null` is a malformed request, not a request for a
   *  blank one, and is left for `DraftFields` to refuse on its own. */
  function parseDraftFields(input: unknown): DraftFieldValues {
    const parsed = DraftFields.safeParse(input === undefined ? {} : input);
    if (!parsed.success) {
      throw new DomainError("INVALID_REQUEST", parsed.error.issues[0]?.message ?? "Invalid draft fields.");
    }
    const f = parsed.data;
    const fields: DraftFieldValues = {
      project: f.project ?? null,
      requestingDepartmentId: f.requestingDepartmentId ?? null,
      performingDepartmentId: f.performingDepartmentId ?? null,
      fundingType: f.fundingType ?? null,
      requestingLocationType: f.requestingLocationType ?? null,
      performingLocationType: f.performingLocationType ?? null,
      requestingProgramManager: f.requestingProgramManager ?? null,
      requestingFinanceApprover: f.requestingFinanceApprover ?? null,
      performingProgramManager: f.performingProgramManager ?? null,
      performingFinanceApprover: f.performingFinanceApprover ?? null,
      performingContact: f.performingContact ?? null,
    };
    const requestingDept = resolveDepartmentIfSet(fields.requestingDepartmentId);
    const performingDept = resolveDepartmentIfSet(fields.performingDepartmentId);
    if (requestingDept && performingDept) requirePermissiblePairing(requestingDept, performingDept);
    return fields;
  }

  /** Loads a draft and checks it is the caller's own - every mutation but
   *  creation needs both. Purges expired drafts first, so a draft that
   *  should already be gone is never found and acted on by accident. */
  function requireOwnedDraft(participantId: string, draftId: string): Draft {
    purgeExpiredDrafts(db);
    const draft = findDraft(db, draftId);
    if (!draft) throw new DomainError("UNKNOWN_DRAFT", `No draft with id "${draftId}".`);
    if (draft.submitterId !== participantId) {
      throw new DomainError("NOT_DRAFT_OWNER", "Only the submitter may change this draft.");
    }
    return draft;
  }

  function readStoreInfo(): StoreInfo {
    const meta = db.prepare("SELECT key, value FROM store_meta").all() as {
      key: string;
      value: string;
    }[];
    const byKey = new Map(meta.map((row) => [row.key, row.value]));
    const count = (sql: string): number => (db.prepare(sql).get() as { n: number }).n;
    return {
      schemaVersion: Number(byKey.get("schema_version") ?? 0),
      seededAt: byKey.get("seeded_at") ?? "",
      participantCount: count("SELECT COUNT(*) AS n FROM participants"),
      departmentCount: count("SELECT COUNT(*) AS n FROM departments"),
    };
  }

  return {
    /** Who exists. Read from the store, not from the seed file on disk. */
    listParticipants(ctx: ActingParticipant): Participant[] {
      requireParticipant(ctx);
      return db
        .prepare("SELECT id, name, role, department FROM participants ORDER BY name")
        .all() as Participant[];
    },

    /**
     * Find a department: narrow on any attributes in any combination, then
     * search what remains by name (BDR-0008). Nothing is required - a submitter
     * certain of nothing gets the whole selectable list.
     */
    searchDepartments(ctx: ActingParticipant, query?: DepartmentQueryInput): ResolvedDepartment[] {
      requireParticipant(ctx);
      const parsed = DepartmentQuery.safeParse(query ?? {});
      if (!parsed.success) {
        throw new DomainError(
          "INVALID_REQUEST",
          parsed.error.issues[0]?.message ?? "Invalid department query.",
        );
      }
      return findDepartments(db, parsed.data);
    },

    /**
     * One department with the two levels above it derived, so nothing is keyed
     * that can be resolved. Inactive departments resolve too - that is what
     * marking one inactive instead of deleting it is for (BDR-0010).
     */
    getDepartment(ctx: ActingParticipant, departmentId: string): ResolvedDepartment {
      requireParticipant(ctx);
      const parsed = HierarchyId.safeParse(departmentId);
      if (!parsed.success) {
        throw new DomainError(
          "INVALID_REQUEST",
          parsed.error.issues[0]?.message ?? "Invalid department id.",
        );
      }
      const found = resolveDepartment(db, parsed.data);
      if (!found) {
        throw new DomainError(
          "UNKNOWN_DEPARTMENT",
          `No department with id "${departmentId}".`,
        );
      }
      return found;
    },

    /** What the store is, so a demo can tell which seeding it is looking at. */
    getStoreInfo(ctx: ActingParticipant): StoreInfo {
      requireParticipant(ctx);
      return readStoreInfo();
    },

    /** Return the store to its seeded state. ADR-0008 makes the store
     *  disposable rather than migrated, which is what lets a demo be replayed. */
    resetStore(ctx: ActingParticipant): StoreInfo {
      requireParticipant(ctx);
      store.reseed();
      return readStoreInfo();
    },

    /**
     * A submitter creates a draft, filling in whatever it already knows.
     * Nothing is required - a draft is allowed to be incomplete (ADR-0009) -
     * so `fields` defaults to naming nothing at all.
     */
    createDraft(ctx: ActingParticipant, fields?: DraftFieldsInput): Draft {
      const participantId = requireRealParticipant(ctx);
      purgeExpiredDrafts(db);
      return insertDraft(db, participantId, parseDraftFields(fields));
    },

    /** A submitter's own queue of drafts (CONTEXT.md: visible in "its
     *  submitter's queue"). */
    listMyDrafts(ctx: ActingParticipant): Draft[] {
      const participantId = requireParticipant(ctx);
      purgeExpiredDrafts(db);
      return listDraftsBySubmitter(db, participantId);
    },

    /** Reopening a draft, or reading it from the master dashboard once one
     *  exists - open to any known participant, the same visibility every
     *  authorization has (BDR-0007). */
    getDraft(ctx: ActingParticipant, draftId: string): Draft {
      requireParticipant(ctx);
      purgeExpiredDrafts(db);
      const draft = findDraft(db, draftId);
      if (!draft) throw new DomainError("UNKNOWN_DRAFT", `No draft with id "${draftId}".`);
      return draft;
    },

    /** Saved as a whole: `fields` is the draft's complete current contents,
     *  not a patch (ADR-0009). Only the submitter may save over it. */
    updateDraft(ctx: ActingParticipant, draftId: string, fields: DraftFieldsInput): Draft {
      const participantId = requireParticipant(ctx);
      requireOwnedDraft(participantId, draftId);
      return replaceDraftFields(db, draftId, parseDraftFields(fields));
    },

    /** Leaves no trace anywhere - the same outcome a month of neglect
     *  produces on its own. Only the submitter may delete their draft. */
    deleteDraft(ctx: ActingParticipant, draftId: string): { deleted: true } {
      const participantId = requireParticipant(ctx);
      requireOwnedDraft(participantId, draftId);
      removeDraft(db, draftId);
      return { deleted: true };
    },

    /** Resource lines are added and removed freely while a draft stands
     *  (BDR-0007) - each call takes effect immediately rather than waiting
     *  on a save of the rest of the draft. */
    addResource(ctx: ActingParticipant, draftId: string, resource: unknown): Draft {
      const participantId = requireParticipant(ctx);
      requireOwnedDraft(participantId, draftId);
      const parsed = ResourceInput.safeParse(resource);
      if (!parsed.success) {
        throw new DomainError("INVALID_REQUEST", parsed.error.issues[0]?.message ?? "Invalid resource.");
      }
      return addDraftResource(db, draftId, parsed.data);
    },

    removeResource(ctx: ActingParticipant, draftId: string, resourceId: string): Draft {
      const participantId = requireParticipant(ctx);
      requireOwnedDraft(participantId, draftId);
      if (!resourceExists(db, draftId, resourceId)) {
        throw new DomainError("UNKNOWN_RESOURCE", `No resource with id "${resourceId}" on this draft.`);
      }
      return removeDraftResource(db, draftId, resourceId);
    },

    /**
     * The submitter releases a draft into the relay (ADR-0009). Completeness
     * is required here and nowhere earlier - `CompleteDraftFields` is the
     * same rule set `DraftFields` relaxes, evaluated at initiation's
     * strictness. On success the draft is discharged: the first transition
     * carries its contents forward, and the draft itself leaves no trace,
     * same as any other way a draft ends.
     */
    initiateDraft(ctx: ActingParticipant, draftId: string, options?: TransitionOptionsInput): Authorization {
      const participantId = requireParticipant(ctx);
      const draft = requireOwnedDraft(participantId, draftId);

      const parsedOptions = TransitionOptions.safeParse(options ?? {});
      if (!parsedOptions.success) {
        throw new DomainError(
          "INVALID_REQUEST",
          parsedOptions.error.issues[0]?.message ?? "Invalid transition options.",
        );
      }
      const occurredAt = parsedOptions.data.occurredAt ?? new Date().toISOString();

      const complete = CompleteDraftFields.safeParse({
        project: draft.project,
        requestingDepartmentId: draft.requestingDepartmentId,
        performingDepartmentId: draft.performingDepartmentId,
        fundingType: draft.fundingType,
        requestingLocationType: draft.requestingLocationType,
        performingLocationType: draft.performingLocationType,
        requestingProgramManager: draft.requestingProgramManager,
        requestingFinanceApprover: draft.requestingFinanceApprover,
        performingProgramManager: draft.performingProgramManager,
        performingFinanceApprover: draft.performingFinanceApprover,
        performingContact: draft.performingContact,
        resources: draft.resources,
      });
      if (!complete.success) {
        throw new DomainError(
          "DRAFT_INCOMPLETE",
          complete.error.issues[0]?.message ?? "This draft is not yet complete.",
        );
      }

      // `complete.data.resources` validated only shape (budgetHours,
      // laborRate) and drops the ids a draft's resources already have -
      // `draft.resources` is carried forward instead so the authorization
      // keeps them.
      const fields: AuthorizationFields = {
        ...complete.data,
        performingContact: complete.data.performingContact ?? null,
        resources: draft.resources,
      };

      // One transaction: the draft is discharged into the log at the moment
      // it becomes the record (ADR-0009), not in two separate commits that a
      // crash between them could leave half-done - an authorization with no
      // draft to have come from, or a draft still sitting there to be
      // initiated a second time.
      db.exec("BEGIN");
      let authorization: Authorization;
      try {
        authorization = appendInitiationTransition(db, { actorId: participantId, occurredAt, fields });
        deleteDraftRows(db, draftId);
        db.exec("COMMIT");
      } catch (err) {
        db.exec("ROLLBACK");
        throw err;
      }
      return authorization;
    },

    /** The whole permissibility list, for the Administrator's surface and
     *  for anyone who wants to see what it currently refuses (#53,
     *  ADR-0011). Short enough to show as a list, not paged. */
    listPermissibilityRules(ctx: ActingParticipant): PermissibilityRule[] {
      requireParticipant(ctx);
      return listRules(db);
    },

    /** An Administrator adds a pairing; it takes effect on the next draft
     *  saved, with no build (#53). Re-adding a pairing already on the list
     *  is a no-op, not an error. */
    addPermissibilityRule(ctx: ActingParticipant, rule: unknown): PermissibilityRule {
      requireAdministrator(ctx);
      const parsed = PermissibilityRuleInput.safeParse(rule);
      if (!parsed.success) {
        throw new DomainError(
          "INVALID_REQUEST",
          parsed.error.issues[0]?.message ?? "Invalid permissibility rule.",
        );
      }
      return addRule(db, parsed.data);
    },

    /** An Administrator removes a pairing; departments that were refused
     *  become permitted on the next draft saved. */
    removePermissibilityRule(ctx: ActingParticipant, ruleId: string): { deleted: true } {
      requireAdministrator(ctx);
      if (!permissibilityRuleExists(db, ruleId)) {
        throw new DomainError(
          "UNKNOWN_PERMISSIBILITY_RULE",
          `No permissibility rule with id "${ruleId}".`,
        );
      }
      removeRule(db, ruleId);
      return { deleted: true };
    },

    /** Read back an initiated authorization - open to any known participant,
     *  the same visibility every authorization has (BDR-0007). */
    getAuthorization(ctx: ActingParticipant, authorizationId: string): Authorization {
      requireParticipant(ctx);
      const authorization = findAuthorization(db, authorizationId);
      if (!authorization) {
        throw new DomainError("UNKNOWN_AUTHORIZATION", `No authorization with id "${authorizationId}".`);
      }
      return authorization;
    },

    /** What is waiting on this participant's action (#55, BDR-0002/BDR-0003:
     *  "what is waiting on your action"). Empty for anyone who is not an
     *  Approver, `system` included - a queue is not an error to ask for, it
     *  is simply empty for a role that holds none. */
    listMyQueue(ctx: ActingParticipant): Authorization[] {
      const participantId = requireParticipant(ctx);
      const participant = readParticipant(participantId);
      if (!participant || participant.role !== "Approver") return [];
      return listApproverQueue(db, participant.department);
    },

    /**
     * An Approver signs off on the stage an authorization currently sits at
     * (#55). Checked against the same rule that built the queue they found
     * it in - a role at a department, never a named person (BDR-0013) - so
     * calling this directly cannot reach what the queue itself would have
     * refused to show. On success the authorization advances to whatever the
     * relay configuration names next and leaves this Approver's queue.
     */
    acknowledge(
      ctx: ActingParticipant,
      authorizationId: string,
      options?: TransitionOptionsInput,
    ): Authorization {
      const participantId = requireParticipant(ctx);
      const authorization = findAuthorization(db, authorizationId);
      if (!authorization) {
        throw new DomainError("UNKNOWN_AUTHORIZATION", `No authorization with id "${authorizationId}".`);
      }

      const participant = readParticipant(participantId);
      if (!participant || !isQueuedFor(db, authorization, participant)) {
        throw new DomainError(
          "NOT_IN_QUEUE",
          "Only an Approver at this stage's department may acknowledge it.",
        );
      }

      const parsedOptions = TransitionOptions.safeParse(options ?? {});
      if (!parsedOptions.success) {
        throw new DomainError(
          "INVALID_REQUEST",
          parsedOptions.error.issues[0]?.message ?? "Invalid transition options.",
        );
      }
      const occurredAt = parsedOptions.data.occurredAt ?? new Date().toISOString();

      return appendAcknowledgementTransition(db, { authorizationId, actorId: participantId, occurredAt });
    },

    close(): void {
      store.close();
    },

    /**
     * Test-only escape hatch, so a test can put the store into a state the
     * command surface deliberately cannot reach. Never called by the server or
     * the web app; the name is meant to be uncomfortable.
     */
    __unsafeRawExec(sql: string): void {
      db.exec(sql);
    },
  };
}

export type Service = ReturnType<typeof createService>;
