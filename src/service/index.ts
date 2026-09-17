import { randomUUID } from "node:crypto";
import { openStore, DEFAULT_STORE_PATH } from "../store/index.ts";
import {
  ActingParticipant,
  CompleteDraftFields,
  ContributeFields,
  CorrectionFieldValues,
  CorrectionRequestInput,
  DepartmentQuery,
  DraftFields,
  HierarchyId,
  MintFields,
  PermissibilityRuleInput,
  ReferralInput,
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
  appendClaimTransition,
  appendCompletionTransition,
  appendContributionTransition,
  appendCorrectionRequestTransition,
  appendCorrectionTransition,
  appendHoldTransition,
  appendInitiationTransition,
  appendReferralTransition,
  appendReleaseTransition,
  appendWithdrawalTransition,
  classificationOf,
  correctionOwner,
  findAuthorization,
  listAuthorizations,
} from "../authorizations/index.ts";
import type { Authorization, AuthorizationFields, FrozenClassification } from "../authorizations/index.ts";
import {
  isHolderOf,
  isQueuedFor,
  isQueuedForClaim,
  isQueuedForMint,
  listApproverQueue,
  listChargeNumberAdminQueue,
  listContributorQueue,
  listCorrectionQueue,
} from "../queues/index.ts";
import { isContributionStage, RELAY_CONFIG } from "../relay/config.ts";
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

  /** Only the submitter may hold, release or withdraw their own authorization
   *  (#61, BDR-0003: "nobody but the submitter needs to pause an
   *  authorization" - CONTEXT.md extends the same rule to withdrawal). */
  function requireSubmitter(authorization: Authorization, participantId: string): void {
    if (authorization.submitterId !== participantId) {
      throw new DomainError(
        "NOT_SUBMITTER",
        "Only the submitter may hold, release or withdraw their own authorization.",
      );
    }
  }

  /** Completion (a charge number existing) and withdrawal are each terminal
   *  and mutually exclusive (#61, ADR-0007) - shared by `hold`, `release`
   *  and `withdraw` so a third terminal marker (revocation, #64) only needs
   *  adding here rather than in three near-identical checks. */
  function requireNotTerminal(authorization: Authorization, verb: string): void {
    if (authorization.chargeNumber !== null || authorization.withdrawnAt !== null) {
      throw new DomainError(
        "AUTHORIZATION_TERMINAL",
        `This authorization has already reached a terminal state and cannot be ${verb}.`,
      );
    }
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
     *  "what is waiting on your action"). Empty for `system` and for the
     *  Administrator, who holds no queue - a queue is not an error to ask
     *  for, it is simply empty for a role that holds none. An Approver's
     *  queue is what has arrived at their stage; a Contributor's is their
     *  department's performing-department queue (#56), claimed and
     *  unclaimed authorizations alike; the Charge Number Admin's is
     *  whatever has reached the mint stage, not yet completed (#58,
     *  `listChargeNumberAdminQueue`) - unlike the other two, not scoped by
     *  department, since minting is tied to neither side. Every
     *  participant's queue also carries any outstanding correction request
     *  addressed to them (#59) - independent of role, since the submitter is
     *  a relationship to one authorization rather than a role (CONTEXT.md),
     *  and disjoint from the role-based queue above: an authorization
     *  awaiting correction has already left its approver's queue
     *  (`isQueuedFor`/`listApproverQueue`), and the contribution and mint
     *  stages are never themselves the one awaiting correction (no Approver
     *  ever sits there to raise one). The log is folded once, via
     *  `listAuthorizations`, and handed to both queue functions below rather
     *  than each reading it again on its own. An authorization on hold is
     *  excluded from every one of them (#61, CONTEXT.md: "In nobody's queue
     *  while held") - each queue function in `queues/index.ts` checks
     *  `onHold` itself, the same way each already checks `awaitingCorrection`,
     *  rather than this function filtering it out once on their behalf.
     *  `listAuthorizations` itself only excludes terminal authorizations,
     *  since holding is not one. */
    listMyQueue(ctx: ActingParticipant): Authorization[] {
      const participantId = requireParticipant(ctx);
      const participant = readParticipant(participantId);
      const authorizations = listAuthorizations(db);
      const roleQueue = !participant
        ? []
        : participant.role === "Approver"
          ? listApproverQueue(authorizations, db, participant.department)
          : participant.role === "Contributor"
            ? listContributorQueue(authorizations, db, participant.department)
            : participant.role === "Charge Number Admin"
              ? listChargeNumberAdminQueue(authorizations)
              : [];
      return [...roleQueue, ...listCorrectionQueue(authorizations, participantId)];
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

    /**
     * A contributor in the performing department claims an unclaimed
     * authorization (#56, CONTEXT.md: "Claim"), which is what names them as
     * its performing contributor - so corrections against the performing
     * section have a target. Checked against the same rule that built the
     * queue they found it in: a Contributor at the stage's department, and
     * only while nobody has claimed it yet (`isQueuedForClaim` in
     * `queues/index.ts`). Does not advance the relay - claiming only takes
     * ownership; `contribute` is what resolves the stage.
     */
    claim(ctx: ActingParticipant, authorizationId: string, options?: TransitionOptionsInput): Authorization {
      const participantId = requireParticipant(ctx);
      const authorization = findAuthorization(db, authorizationId);
      if (!authorization) {
        throw new DomainError("UNKNOWN_AUTHORIZATION", `No authorization with id "${authorizationId}".`);
      }

      const participant = readParticipant(participantId);
      if (!participant || !isQueuedForClaim(db, authorization, participant)) {
        throw new DomainError(
          "NOT_IN_QUEUE",
          "Only a Contributor at this stage's department may claim an unclaimed authorization.",
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

      return appendClaimTransition(db, { authorizationId, actorId: participantId, occurredAt });
    },

    /**
     * The performing contributor who claimed this authorization fills the
     * performing-side section - today, just the employee who will perform
     * the work (#56, CONTEXT.md: "a name on the record, not a participant in
     * the process"). Only the contributor who claimed it may complete it;
     * being at the right department is not enough once it is claimed, the
     * same way only the submitter may act on their own draft. On success the
     * stage resolves and the authorization advances to whatever the relay
     * configuration names next.
     */
    contribute(ctx: ActingParticipant, authorizationId: string, fields: unknown): Authorization {
      const participantId = requireParticipant(ctx);
      const authorization = findAuthorization(db, authorizationId);
      if (!authorization) {
        throw new DomainError("UNKNOWN_AUTHORIZATION", `No authorization with id "${authorizationId}".`);
      }

      if (authorization.onHold) {
        throw new DomainError("AUTHORIZATION_ON_HOLD", "This authorization is on hold and cannot be acted on.");
      }

      const stage = RELAY_CONFIG.find((s) => s.id === authorization.currentStageId)!;
      if (!isContributionStage(stage) || authorization.performingContributorId !== participantId) {
        throw new DomainError(
          "NOT_CLAIMANT",
          "Only the contributor who claimed this authorization may fill the performing-side section.",
        );
      }

      const parsedFields = ContributeFields.safeParse(fields);
      if (!parsedFields.success) {
        throw new DomainError(
          "INVALID_REQUEST",
          parsedFields.error.issues[0]?.message ?? "Invalid performing-side fields.",
        );
      }

      const parsedOptions = TransitionOptions.safeParse(fields ?? {});
      if (!parsedOptions.success) {
        throw new DomainError(
          "INVALID_REQUEST",
          parsedOptions.error.issues[0]?.message ?? "Invalid transition options.",
        );
      }
      const occurredAt = parsedOptions.data.occurredAt ?? new Date().toISOString();

      return appendContributionTransition(db, {
        authorizationId,
        actorId: participantId,
        occurredAt,
        performingEmployee: parsedFields.data.performingEmployee,
      });
    },

    /**
     * The Charge Number Admin minting a charge number (#58, CONTEXT.md:
     * "the role that mints the charge number and thereby completes the
     * authorization"). Reached only once every earlier stage has resolved -
     * the mint stage is the relay's last, arrived at the same way any other
     * stage is. Not an approval: there is no acknowledgement here, only a
     * value supplied, and completion follows from that value existing
     * (BDR-0003). The classification frozen onto this transition is
     * resolved live one final time, right here, the last live read the
     * record ever makes for either side (ADR-0007).
     */
    mintChargeNumber(ctx: ActingParticipant, authorizationId: string, fields: unknown): Authorization {
      const participantId = requireParticipant(ctx);
      const authorization = findAuthorization(db, authorizationId);
      if (!authorization) {
        throw new DomainError("UNKNOWN_AUTHORIZATION", `No authorization with id "${authorizationId}".`);
      }

      const participant = readParticipant(participantId);
      if (!participant || !isQueuedForMint(authorization, participant)) {
        throw new DomainError(
          "NOT_IN_QUEUE",
          "Only a Charge Number Admin may mint this authorization's charge number.",
        );
      }

      const parsedFields = MintFields.safeParse(fields);
      if (!parsedFields.success) {
        throw new DomainError("INVALID_REQUEST", parsedFields.error.issues[0]?.message ?? "Invalid charge number.");
      }

      const parsedOptions = TransitionOptions.safeParse(fields ?? {});
      if (!parsedOptions.success) {
        throw new DomainError(
          "INVALID_REQUEST",
          parsedOptions.error.issues[0]?.message ?? "Invalid transition options.",
        );
      }
      const occurredAt = parsedOptions.data.occurredAt ?? new Date().toISOString();

      const requesting = resolveDepartmentIfSet(authorization.requestingDepartmentId)!;
      const performing = resolveDepartmentIfSet(authorization.performingDepartmentId)!;

      return appendCompletionTransition(db, {
        authorizationId,
        actorId: participantId,
        occurredAt,
        chargeNumber: parsedFields.data.chargeNumber,
        classification: {
          requesting: classificationOf(requesting),
          performing: classificationOf(performing),
        },
      });
    },

    /**
     * An authorization's classification for both sides (ADR-0007): resolved
     * live from the hierarchy while it is still moving, and read back from
     * the terminal transition once minting has frozen it - a settled record
     * reads as the structure it was settled under, and a later restructure
     * cannot rewrite it.
     */
    getClassification(
      ctx: ActingParticipant,
      authorizationId: string,
    ): { requesting: FrozenClassification; performing: FrozenClassification } {
      requireParticipant(ctx);
      const authorization = findAuthorization(db, authorizationId);
      if (!authorization) {
        throw new DomainError("UNKNOWN_AUTHORIZATION", `No authorization with id "${authorizationId}".`);
      }
      if (authorization.classification) return authorization.classification;
      return {
        requesting: classificationOf(resolveDepartmentIfSet(authorization.requestingDepartmentId)!),
        performing: classificationOf(resolveDepartmentIfSet(authorization.performingDepartmentId)!),
      };
    },

    /**
     * An Approver raising a correction request at the stage an
     * authorization currently sits at (#59, BDR-0005): names the fields at
     * fault and carries a mandatory comment. Checked against the same rule
     * `acknowledge` is - a role at a department, and not already awaiting a
     * correction (`isQueuedFor`) - so this can never be raised twice over
     * the same one. The authorization's position does not move; only the
     * stage's condition does, which is why there is no `nextStageId` here
     * the way there is for an acknowledgement.
     */
    requestCorrection(ctx: ActingParticipant, authorizationId: string, input: unknown): Authorization {
      const participantId = requireParticipant(ctx);
      const authorization = findAuthorization(db, authorizationId);
      if (!authorization) {
        throw new DomainError("UNKNOWN_AUTHORIZATION", `No authorization with id "${authorizationId}".`);
      }

      const participant = readParticipant(participantId);
      if (!participant || !isQueuedFor(db, authorization, participant)) {
        throw new DomainError(
          "NOT_IN_QUEUE",
          "Only an Approver at this stage's department may raise a correction request.",
        );
      }

      const parsed = CorrectionRequestInput.safeParse(input);
      if (!parsed.success) {
        throw new DomainError("INVALID_REQUEST", parsed.error.issues[0]?.message ?? "Invalid correction request.");
      }

      // `performingDepartmentId` can never be satisfied by `correct` (see
      // below) - bundling it with any other field would strand that field
      // too, since `correct` refuses the whole submission the moment
      // `performingDepartmentId` is anywhere in the outstanding request.
      // Naming it is only ever useful alone.
      if (parsed.data.fields.includes("performingDepartmentId") && parsed.data.fields.length > 1) {
        throw new DomainError(
          "INVALID_REQUEST",
          "The performing department cannot be corrected, so it may only be named on its own - " +
            "raise the other fields as a separate request.",
        );
      }

      // A single request may address only one corrector - see
      // `correctionOwner` in `authorizations/index.ts` for why fields split
      // this way. The one case this refuses is a mix of `performingEmployee`
      // and anything else, which would otherwise leave nobody able to
      // satisfy the whole of it in one act - except when `performingEmployee`
      // is named alone before anyone has claimed the authorization, which
      // `correctionOwner` also reports as `null` since there is nobody to
      // address it to yet.
      const owner = correctionOwner(authorization, parsed.data.fields);
      if (owner === null) {
        const spansBothOwners =
          parsed.data.fields.includes("performingEmployee") &&
          parsed.data.fields.some((field) => field !== "performingEmployee");
        throw new DomainError(
          "INVALID_REQUEST",
          spansBothOwners
            ? "A correction request may name fields with only one corrector - raise the other side as a separate request."
            : "Nobody has claimed this authorization yet, so there is no performing contributor to address a correction naming the employee performing the work to.",
        );
      }

      const parsedOptions = TransitionOptions.safeParse(input ?? {});
      if (!parsedOptions.success) {
        throw new DomainError(
          "INVALID_REQUEST",
          parsedOptions.error.issues[0]?.message ?? "Invalid transition options.",
        );
      }
      const occurredAt = parsedOptions.data.occurredAt ?? new Date().toISOString();

      return appendCorrectionRequestTransition(db, {
        authorizationId,
        actorId: participantId,
        occurredAt,
        stageId: authorization.currentStageId,
        fields: parsed.data.fields,
        comment: parsed.data.comment,
      });
    },

    /**
     * The field's owner supplying the fix (#59, CONTEXT.md: "made on the
     * authorization where it stands"). Must supply a value for every field
     * the outstanding request named, and no others - a partial correction
     * would leave the request half-satisfied with nothing recording which
     * half. `performingDepartmentId` can be named in a request but never
     * corrected here (BDR-0012): it is fixed at initiation, so the only
     * resolution is to withdraw and raise a new authorization against the
     * right department - a later ticket's build.
     */
    correct(ctx: ActingParticipant, authorizationId: string, fields: unknown): Authorization {
      const participantId = requireParticipant(ctx);
      const authorization = findAuthorization(db, authorizationId);
      if (!authorization) {
        throw new DomainError("UNKNOWN_AUTHORIZATION", `No authorization with id "${authorizationId}".`);
      }
      if (authorization.onHold) {
        throw new DomainError("AUTHORIZATION_ON_HOLD", "This authorization is on hold and cannot be acted on.");
      }

      const outstanding = authorization.correctionRequest;
      if (!outstanding) {
        throw new DomainError(
          "NOT_AWAITING_CORRECTION",
          "This authorization has no outstanding correction request.",
        );
      }

      if (correctionOwner(authorization, outstanding.fields) !== participantId) {
        throw new DomainError(
          "NOT_CORRECTOR",
          "Only the owner of the fields the correction request named may supply the fix.",
        );
      }

      if (outstanding.fields.includes("performingDepartmentId")) {
        throw new DomainError(
          "FIELD_NOT_CORRECTABLE",
          "The performing department cannot be corrected - it is fixed once the authorization is initiated. " +
            "Withdraw this authorization and raise a new one against the right department.",
        );
      }

      const parsed = CorrectionFieldValues.safeParse(fields);
      if (!parsed.success) {
        throw new DomainError("INVALID_REQUEST", parsed.error.issues[0]?.message ?? "Invalid correction.");
      }

      const suppliedKeys = Object.keys(parsed.data).sort();
      const requestedKeys = [...outstanding.fields].sort();
      const suppliesExactlyWhatWasAsked =
        suppliedKeys.length === requestedKeys.length && suppliedKeys.every((key, i) => key === requestedKeys[i]);
      if (!suppliesExactlyWhatWasAsked) {
        throw new DomainError(
          "INVALID_REQUEST",
          "The correction must supply a value for every field the request named, and no others.",
        );
      }

      if (parsed.data.requestingDepartmentId !== undefined) {
        if (parsed.data.requestingDepartmentId === authorization.performingDepartmentId) {
          throw new DomainError(
            "INVALID_REQUEST",
            "The requesting and performing department may not be the same.",
          );
        }
        const requestingDept = resolveDepartmentIfSet(parsed.data.requestingDepartmentId)!;
        const performingDept = resolveDepartmentIfSet(authorization.performingDepartmentId)!;
        requirePermissiblePairing(requestingDept, performingDept);
      }

      // `resources` carries no id from the corrector, the same as a fresh
      // draft's do not (#52's `CompleteDraftFields`) - assigned fresh ones
      // here rather than reusing whatever the authorization already had,
      // since a correction replaces the whole list rather than patching a
      // line within it.
      const { resources, ...correctedRest } = parsed.data;
      const correctedFields: Partial<AuthorizationFields> & { performingEmployee?: string } = { ...correctedRest };
      if (resources !== undefined) {
        correctedFields.resources = resources.map((resource) => ({ id: `resource-${randomUUID()}`, ...resource }));
      }

      const parsedOptions = TransitionOptions.safeParse(fields ?? {});
      if (!parsedOptions.success) {
        throw new DomainError(
          "INVALID_REQUEST",
          parsedOptions.error.issues[0]?.message ?? "Invalid transition options.",
        );
      }
      const occurredAt = parsedOptions.data.occurredAt ?? new Date().toISOString();

      return appendCorrectionTransition(db, {
        authorizationId,
        actorId: participantId,
        occurredAt,
        stageId: authorization.currentStageId,
        fields: correctedFields,
      });
    },

    /**
     * The submitter pausing their own authorization (#61, CONTEXT.md: "On
     * hold"). Only the submitter may hold, and only while it is neither
     * already held nor terminal - a completed or withdrawn authorization has
     * nothing left to pause. Removes it from every queue the instant this
     * returns (every queue function in `queues/index.ts` checks `onHold`),
     * and disturbs nothing about its position: it resumes at exactly the
     * stage it left.
     */
    hold(ctx: ActingParticipant, authorizationId: string, options?: TransitionOptionsInput): Authorization {
      const participantId = requireParticipant(ctx);
      const authorization = findAuthorization(db, authorizationId);
      if (!authorization) {
        throw new DomainError("UNKNOWN_AUTHORIZATION", `No authorization with id "${authorizationId}".`);
      }
      requireSubmitter(authorization, participantId);
      requireNotTerminal(authorization, "held");

      if (authorization.onHold) {
        throw new DomainError("ALREADY_ON_HOLD", "This authorization is already on hold.");
      }

      const parsedOptions = TransitionOptions.safeParse(options ?? {});
      if (!parsedOptions.success) {
        throw new DomainError(
          "INVALID_REQUEST",
          parsedOptions.error.issues[0]?.message ?? "Invalid transition options.",
        );
      }
      const occurredAt = parsedOptions.data.occurredAt ?? new Date().toISOString();

      return appendHoldTransition(db, { authorizationId, actorId: participantId, occurredAt });
    },

    /**
     * The submitter releasing a hold (#61, CONTEXT.md: "and only the
     * submitter releases it"). Only while a hold is genuinely open -
     * releasing one that never started, or one a terminal transition has
     * since overtaken, is refused rather than silently ignored. Resolves
     * nothing and moves nothing: the authorization simply rejoins whatever
     * queue its current stage already puts it in.
     */
    release(ctx: ActingParticipant, authorizationId: string, options?: TransitionOptionsInput): Authorization {
      const participantId = requireParticipant(ctx);
      const authorization = findAuthorization(db, authorizationId);
      if (!authorization) {
        throw new DomainError("UNKNOWN_AUTHORIZATION", `No authorization with id "${authorizationId}".`);
      }
      requireSubmitter(authorization, participantId);
      requireNotTerminal(authorization, "released");

      if (!authorization.onHold) {
        throw new DomainError("NOT_ON_HOLD", "This authorization is not on hold.");
      }

      const parsedOptions = TransitionOptions.safeParse(options ?? {});
      if (!parsedOptions.success) {
        throw new DomainError(
          "INVALID_REQUEST",
          parsedOptions.error.issues[0]?.message ?? "Invalid transition options.",
        );
      }
      const occurredAt = parsedOptions.data.occurredAt ?? new Date().toISOString();

      return appendReleaseTransition(db, { authorizationId, actorId: participantId, occurredAt });
    },

    /**
     * The submitter withdrawing their own authorization (#61, CONTEXT.md:
     * "Withdrawn"): terminal, and distinct from a future revocation
     * (#64) - the transition kind itself says which caused it, so the two
     * can never be confused in the record. Reachable whether the
     * authorization is on hold or moving normally; refused only once it has
     * already reached a terminal state. The classification frozen onto this
     * transition is resolved live one final time, right here, exactly as
     * `mintChargeNumber` already does for completion (ADR-0007).
     */
    withdraw(ctx: ActingParticipant, authorizationId: string, options?: TransitionOptionsInput): Authorization {
      const participantId = requireParticipant(ctx);
      const authorization = findAuthorization(db, authorizationId);
      if (!authorization) {
        throw new DomainError("UNKNOWN_AUTHORIZATION", `No authorization with id "${authorizationId}".`);
      }
      requireSubmitter(authorization, participantId);
      requireNotTerminal(authorization, "withdrawn again");

      const parsedOptions = TransitionOptions.safeParse(options ?? {});
      if (!parsedOptions.success) {
        throw new DomainError(
          "INVALID_REQUEST",
          parsedOptions.error.issues[0]?.message ?? "Invalid transition options.",
        );
      }
      const occurredAt = parsedOptions.data.occurredAt ?? new Date().toISOString();

      const requesting = resolveDepartmentIfSet(authorization.requestingDepartmentId)!;
      const performing = resolveDepartmentIfSet(authorization.performingDepartmentId)!;

      return appendWithdrawalTransition(db, {
        authorizationId,
        actorId: participantId,
        occurredAt,
        classification: {
          requesting: classificationOf(requesting),
          performing: classificationOf(performing),
        },
      });
    },

    /**
     * Whoever holds an authorization at their stage showing it to a named
     * colleague, to ask what they cannot answer themselves (#62, BDR-0011).
     * Notifies and records, and does nothing else: the authorization stays
     * exactly where it is, in the referrer's queue, the colleague gains no
     * power to act on it, and the acknowledgement (or whatever else resolves
     * the stage) still comes from whoever the stage actually routed to.
     * Available to the same population who could act on the authorization
     * right now, not approvers only (`isHolderOf` in `queues/index.ts`) - an
     * Approver, the Charge Number Admin, a Contributor at the
     * performing-department stage, or the corrector of an outstanding
     * correction request. The colleague must be a real, known participant -
     * BDR-0011 assumes they can already read the authorization, which only a
     * known participant can. Never counted anywhere: BDR-0011 excludes
     * referrals from every measure, aggregate counts included, so a future
     * insights reader must read one authorization's own history rather than
     * total this across the log.
     */
    refer(ctx: ActingParticipant, authorizationId: string, input: unknown): Authorization {
      const participantId = requireParticipant(ctx);
      const authorization = findAuthorization(db, authorizationId);
      if (!authorization) {
        throw new DomainError("UNKNOWN_AUTHORIZATION", `No authorization with id "${authorizationId}".`);
      }

      const participant = readParticipant(participantId);
      if (!participant || !isHolderOf(db, authorization, participant, participantId)) {
        throw new DomainError(
          "NOT_IN_QUEUE",
          "Only whoever currently holds this authorization at its stage may refer it.",
        );
      }

      const parsed = ReferralInput.safeParse(input);
      if (!parsed.success) {
        throw new DomainError("INVALID_REQUEST", parsed.error.issues[0]?.message ?? "Invalid referral.");
      }
      if (parsed.data.colleagueId === participantId) {
        throw new DomainError("INVALID_REQUEST", "You cannot refer an authorization to yourself.");
      }
      if (parsed.data.colleagueId === SYSTEM_PARTICIPANT_ID) {
        throw new DomainError(
          "INVALID_REQUEST",
          "The system identity cannot be referred to - name a real colleague.",
        );
      }
      requireParticipant({ participantId: parsed.data.colleagueId });

      const parsedOptions = TransitionOptions.safeParse(input ?? {});
      if (!parsedOptions.success) {
        throw new DomainError(
          "INVALID_REQUEST",
          parsedOptions.error.issues[0]?.message ?? "Invalid transition options.",
        );
      }
      const occurredAt = parsedOptions.data.occurredAt ?? new Date().toISOString();

      return appendReferralTransition(db, {
        authorizationId,
        actorId: participantId,
        occurredAt,
        colleagueId: parsed.data.colleagueId,
      });
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
