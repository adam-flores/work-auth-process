import type { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import type { FundingType, LocationType } from "../shared/constants.ts";

/**
 * Reading and writing drafts: the mutable, no-history half of ADR-0009. A
 * draft is a row that is updated in place and deleted outright, never a
 * sequence of transitions - the opposite discipline from the log the relay
 * writes to once an authorization is initiated (a later ticket).
 *
 * As with the hierarchy (`../hierarchy/index.ts`), the service module owns
 * validation; everything here takes and returns already-trusted values.
 */

export type Resource = { id: string; budgetHours: number; laborRate: number };

export type Draft = {
  id: string;
  submitterId: string;
  project: string | null;
  requestingDepartmentId: string | null;
  performingDepartmentId: string | null;
  fundingType: FundingType | null;
  requestingLocationType: LocationType | null;
  performingLocationType: LocationType | null;
  requestingProgramManager: string | null;
  requestingFinanceApprover: string | null;
  performingProgramManager: string | null;
  performingFinanceApprover: string | null;
  performingContact: string | null;
  resources: Resource[];
  createdAt: string;
  updatedAt: string;
};

/** Every field a submitter may set, save-as-a-whole (`DraftFields` in
 *  `shared/rules.ts`) rather than patched one at a time. */
export type DraftFieldValues = Omit<
  Draft,
  "id" | "submitterId" | "resources" | "createdAt" | "updatedAt"
>;

/** CONTEXT.md, Draft: "deleted ... by the system a month after it was last
 *  modified." Thirty days is the prototype's reading of "a month" - close
 *  enough for a control nobody is meant to time to the day. */
const DRAFT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

type DraftRow = {
  id: string;
  submitter_id: string;
  project: string | null;
  requesting_department_id: string | null;
  performing_department_id: string | null;
  funding_type: string | null;
  requesting_location_type: string | null;
  performing_location_type: string | null;
  requesting_program_manager: string | null;
  requesting_finance_approver: string | null;
  performing_program_manager: string | null;
  performing_finance_approver: string | null;
  performing_contact: string | null;
  created_at: string;
  updated_at: string;
};

type ResourceRow = { id: string; budget_hours: number; labor_rate: number };

function readResources(db: DatabaseSync, draftId: string): Resource[] {
  const rows = db
    .prepare("SELECT id, budget_hours, labor_rate FROM draft_resources WHERE draft_id = ? ORDER BY rowid")
    .all(draftId) as ResourceRow[];
  return rows.map((row) => ({ id: row.id, budgetHours: row.budget_hours, laborRate: row.labor_rate }));
}

function rowToDraft(db: DatabaseSync, row: DraftRow): Draft {
  return {
    id: row.id,
    submitterId: row.submitter_id,
    project: row.project,
    requestingDepartmentId: row.requesting_department_id,
    performingDepartmentId: row.performing_department_id,
    fundingType: row.funding_type as FundingType | null,
    requestingLocationType: row.requesting_location_type as LocationType | null,
    performingLocationType: row.performing_location_type as LocationType | null,
    requestingProgramManager: row.requesting_program_manager,
    requestingFinanceApprover: row.requesting_finance_approver,
    performingProgramManager: row.performing_program_manager,
    performingFinanceApprover: row.performing_finance_approver,
    performingContact: row.performing_contact,
    resources: readResources(db, row.id),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Removes every draft (and its resources) untouched since before the cutoff.
 * Run at the top of every draft command rather than on a schedule - this
 * prototype has no background process to run one on, and a lazy sweep is
 * enough to make "removed by the system" true of anything anybody actually
 * looks at. Deletes both tables in one transaction, so expiry leaves no
 * trace the way deletion by the submitter does (ADR-0009).
 */
export function purgeExpiredDrafts(db: DatabaseSync, now: Date = new Date()): void {
  const cutoff = new Date(now.getTime() - DRAFT_TTL_MS).toISOString();
  db.exec("BEGIN");
  try {
    db.prepare(
      "DELETE FROM draft_resources WHERE draft_id IN (SELECT id FROM drafts WHERE updated_at < ?)",
    ).run(cutoff);
    db.prepare("DELETE FROM drafts WHERE updated_at < ?").run(cutoff);
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

export function findDraft(db: DatabaseSync, draftId: string): Draft | null {
  const row = db.prepare("SELECT * FROM drafts WHERE id = ?").get(draftId) as DraftRow | undefined;
  return row ? rowToDraft(db, row) : null;
}

/** A submitter's own queue of drafts, newest activity first. */
export function listDraftsBySubmitter(db: DatabaseSync, submitterId: string): Draft[] {
  const rows = db
    .prepare("SELECT * FROM drafts WHERE submitter_id = ? ORDER BY updated_at DESC")
    .all(submitterId) as DraftRow[];
  return rows.map((row) => rowToDraft(db, row));
}

export function insertDraft(db: DatabaseSync, submitterId: string, fields: DraftFieldValues): Draft {
  const id = `draft-${randomUUID()}`;
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO drafts (
       id, submitter_id, project, requesting_department_id, performing_department_id,
       funding_type, requesting_location_type, performing_location_type,
       requesting_program_manager, requesting_finance_approver,
       performing_program_manager, performing_finance_approver, performing_contact,
       created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    submitterId,
    fields.project,
    fields.requestingDepartmentId,
    fields.performingDepartmentId,
    fields.fundingType,
    fields.requestingLocationType,
    fields.performingLocationType,
    fields.requestingProgramManager,
    fields.requestingFinanceApprover,
    fields.performingProgramManager,
    fields.performingFinanceApprover,
    fields.performingContact,
    now,
    now,
  );
  return findDraft(db, id)!;
}

/** The draft is saved as a whole (see `DraftFieldValues`), not patched field
 *  by field - "the submitter edits it, the system keeps only its current
 *  contents" (ADR-0009). */
export function replaceDraftFields(db: DatabaseSync, draftId: string, fields: DraftFieldValues): Draft {
  db.prepare(
    `UPDATE drafts SET
       project = ?, requesting_department_id = ?, performing_department_id = ?,
       funding_type = ?, requesting_location_type = ?, performing_location_type = ?,
       requesting_program_manager = ?, requesting_finance_approver = ?,
       performing_program_manager = ?, performing_finance_approver = ?, performing_contact = ?,
       updated_at = ?
     WHERE id = ?`,
  ).run(
    fields.project,
    fields.requestingDepartmentId,
    fields.performingDepartmentId,
    fields.fundingType,
    fields.requestingLocationType,
    fields.performingLocationType,
    fields.requestingProgramManager,
    fields.requestingFinanceApprover,
    fields.performingProgramManager,
    fields.performingFinanceApprover,
    fields.performingContact,
    new Date().toISOString(),
    draftId,
  );
  return findDraft(db, draftId)!;
}

/** The two deletes that erase a draft, with no transaction of their own -
 *  exported so a caller that is already inside a transaction (initiation
 *  discharging a draft into the log, ADR-0009) can compose it with other
 *  writes atomically instead of nesting a second BEGIN inside the first,
 *  which SQLite refuses. `removeDraft` below is this same pair for a caller
 *  that is not already in one. */
export function deleteDraftRows(db: DatabaseSync, draftId: string): void {
  db.prepare("DELETE FROM draft_resources WHERE draft_id = ?").run(draftId);
  db.prepare("DELETE FROM drafts WHERE id = ?").run(draftId);
}

/** Deletes the draft and every resource on it in one transaction - deleting
 *  or expiring a draft leaves no trace anywhere (the acceptance criterion,
 *  and ADR-0009's "nothing is appended, because nothing is being recorded
 *  yet"). */
export function removeDraft(db: DatabaseSync, draftId: string): void {
  db.exec("BEGIN");
  try {
    deleteDraftRows(db, draftId);
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

export function resourceExists(db: DatabaseSync, draftId: string, resourceId: string): boolean {
  return (
    db.prepare("SELECT 1 FROM draft_resources WHERE id = ? AND draft_id = ?").get(resourceId, draftId) !==
    undefined
  );
}

/** Adding a resource counts as touching the draft, same as editing a field -
 *  both reset the month-long expiry clock. */
export function addResource(
  db: DatabaseSync,
  draftId: string,
  resource: { budgetHours: number; laborRate: number },
): Draft {
  const id = `resource-${randomUUID()}`;
  db.prepare("INSERT INTO draft_resources (id, draft_id, budget_hours, labor_rate) VALUES (?, ?, ?, ?)").run(
    id,
    draftId,
    resource.budgetHours,
    resource.laborRate,
  );
  db.prepare("UPDATE drafts SET updated_at = ? WHERE id = ?").run(new Date().toISOString(), draftId);
  return findDraft(db, draftId)!;
}

export function removeResource(db: DatabaseSync, draftId: string, resourceId: string): Draft {
  db.prepare("DELETE FROM draft_resources WHERE id = ? AND draft_id = ?").run(resourceId, draftId);
  db.prepare("UPDATE drafts SET updated_at = ? WHERE id = ?").run(new Date().toISOString(), draftId);
  return findDraft(db, draftId)!;
}
