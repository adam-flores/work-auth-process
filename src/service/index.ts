import { openStore, DEFAULT_STORE_PATH } from "../store/index.ts";
import {
  ActingParticipant,
  DepartmentQuery,
  DraftFields,
  HierarchyId,
  ResourceInput,
  SYSTEM_PARTICIPANT_ID,
} from "../shared/rules.ts";
import type { DepartmentQueryInput, DraftFieldsInput, Participant } from "../shared/rules.ts";
import { findDepartments, resolveDepartment } from "../hierarchy/index.ts";
import type { ResolvedDepartment } from "../hierarchy/index.ts";
import {
  addResource as addDraftResource,
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

  /** A department id a draft names has to resolve to something real - the
   *  same rule `getDepartment` already enforces, applied here because a
   *  draft can be written directly through this seam, not only through the
   *  picker that is the UI's only route to one. */
  function requireDepartmentIfSet(departmentId: string | null): void {
    if (departmentId && !resolveDepartment(db, departmentId)) {
      throw new DomainError("UNKNOWN_DEPARTMENT", `No department with id "${departmentId}".`);
    }
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
    requireDepartmentIfSet(fields.requestingDepartmentId);
    requireDepartmentIfSet(fields.performingDepartmentId);
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
