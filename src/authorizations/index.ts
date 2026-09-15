import type { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import type { StageId } from "../guidance/content.ts";
import { RELAY_CONFIG } from "../relay/config.ts";
import type { Resource } from "../drafts/index.ts";
import type { FundingType, LocationType } from "../shared/constants.ts";
import { SYSTEM_PARTICIPANT_ID } from "../shared/constants.ts";

/**
 * The transition log: the append-only half of ADR-0009, and the record
 * itself once an authorization exists (ADR-0004). Nothing here is ever
 * updated or deleted - a fold over this table, not a stored column, is what
 * answers "where is this" and "what does this field hold now."
 *
 * As with drafts and the hierarchy, the service module owns validation;
 * everything here takes and returns already-trusted values.
 */

/** Every field an authorization carries once initiated - the same shape a
 *  complete draft has (`CompleteDraftFields` in `shared/rules.ts`), with
 *  `resources` keeping the ids they had as a draft rather than the bare
 *  `{budgetHours, laborRate}` a fresh submission provides. */
export type AuthorizationFields = {
  project: string;
  requestingDepartmentId: string;
  performingDepartmentId: string;
  fundingType: FundingType;
  requestingLocationType: LocationType;
  performingLocationType: LocationType;
  requestingProgramManager: string;
  requestingFinanceApprover: string;
  performingProgramManager: string;
  performingFinanceApprover: string;
  performingContact: string | null;
  resources: Resource[];
};

/**
 * One stage's three timestamps (#55, BDR-0006, ADR-0004) - arrived, notified,
 * resolved, and no fourth. `resolvedAt` is null while the stage is still the
 * one an authorization sits at; every earlier stage in `stageHistory` always
 * carries one.
 */
export type StageVisit = {
  stageId: StageId;
  arrivedAt: string;
  notifiedAt: string;
  resolvedAt: string | null;
};

export type Authorization = AuthorizationFields & {
  id: string;
  submitterId: string;
  currentStageId: StageId;
  initiatedAt: string;
  /** Every stage reached so far, in the order it was reached, each with its
   *  own three timestamps. The last entry is always `currentStageId`'s. */
  stageHistory: StageVisit[];
  /** Who claimed the performing-department stage (#56, CONTEXT.md: "Claim"),
   *  `null` while it sits there unclaimed. Set once and never cleared - the
   *  same contributor owns the performing-side section for the
   *  authorization's whole life, the way the submitter owns the requesting
   *  side. */
  performingContributorId: string | null;
  /** The employee who will perform the work, recorded by the performing
   *  contributor - "a name on the record, not a participant in the process"
   *  (CONTEXT.md). `null` until the contributor completes the stage. */
  performingEmployee: string | null;
};

type TransitionRow = {
  seq: number;
  id: string;
  authorization_id: string;
  kind: string;
  actor_id: string;
  occurred_at: string;
  payload: string;
};

type InitiationPayload = { fields: AuthorizationFields };
type StagePayload = { stageId: StageId };
type ContributionPayload = { stageId: StageId; performingEmployee: string };

function readTransitions(db: DatabaseSync, authorizationId: string): TransitionRow[] {
  return db
    .prepare("SELECT * FROM transitions WHERE authorization_id = ? ORDER BY seq")
    .all(authorizationId) as TransitionRow[];
}

/** The stage that follows `stageId` in the relay - clamped to the last entry,
 *  since acknowledging the final stage has nowhere further to advance to
 *  (completion is a later ticket's build). */
function nextStageId(stageId: StageId): StageId {
  const index = RELAY_CONFIG.findIndex((stage) => stage.id === stageId);
  const nextIndex = Math.min(index + 1, RELAY_CONFIG.length - 1);
  return RELAY_CONFIG[nextIndex]!.id;
}

/**
 * What resolves a stage - acknowledging it (#55), a contributor completing
 * the performing-department stage (#56), or skipping a gate (a later ticket,
 * #57). Kept as a set for the same reason it was before any but the first
 * kind existed: it is what `foldStageHistory` below reads to fill in a
 * stage's `resolvedAt`, and each later kind fills that in exactly like an
 * acknowledgement does.
 */
const RESOLVING_KINDS = new Set(["acknowledgement", "contribution", "gate-skip"]);

/**
 * Every stage reached so far, each with its own three timestamps (#55,
 * BDR-0006). The first stage's arrival and notification are not separate
 * rows - initiation discharges the draft and arrives it at the relay's first
 * entry in the same instant, so `initiation`'s own timestamp serves both.
 * Every later stage gets an explicit `arrival` transition, appended the
 * moment the one before it resolves (`appendAcknowledgementTransition`
 * below), immediately followed by a `notification` transition - the system
 * notifies on arrival, so the two are recorded back to back rather than
 * carrying a fabricated delay between them.
 */
function foldStageHistory(transitions: TransitionRow[], initiation: TransitionRow): StageVisit[] {
  const first = RELAY_CONFIG[0]!.id;
  const order: StageId[] = [first];
  const byStage = new Map<StageId, StageVisit>([
    [first, { stageId: first, arrivedAt: initiation.occurred_at, notifiedAt: initiation.occurred_at, resolvedAt: null }],
  ]);

  for (const row of transitions) {
    if (row.kind === "arrival") {
      const { stageId } = JSON.parse(row.payload) as StagePayload;
      order.push(stageId);
      byStage.set(stageId, { stageId, arrivedAt: row.occurred_at, notifiedAt: row.occurred_at, resolvedAt: null });
    } else if (row.kind === "notification") {
      const { stageId } = JSON.parse(row.payload) as StagePayload;
      const visit = byStage.get(stageId);
      if (visit) visit.notifiedAt = row.occurred_at;
    } else if (RESOLVING_KINDS.has(row.kind)) {
      const { stageId } = JSON.parse(row.payload) as StagePayload;
      const visit = byStage.get(stageId);
      if (visit) visit.resolvedAt = row.occurred_at;
    }
  }

  return order.map((stageId) => byStage.get(stageId)!);
}

function foldAuthorization(authorizationId: string, transitions: TransitionRow[]): Authorization | null {
  const initiation = transitions.find((row) => row.kind === "initiation");
  if (!initiation) return null;
  const { fields } = JSON.parse(initiation.payload) as InitiationPayload;
  const stageHistory = foldStageHistory(transitions, initiation);

  // Claiming and contributing are each recorded once - the same contributor
  // owns the performing-department stage for the authorization's whole life
  // (#56) - so the first row of each kind is the only one there ever is.
  const claim = transitions.find((row) => row.kind === "claim");
  const contribution = transitions.find((row) => row.kind === "contribution");

  return {
    id: authorizationId,
    submitterId: initiation.actor_id,
    initiatedAt: initiation.occurred_at,
    currentStageId: stageHistory[stageHistory.length - 1]!.stageId,
    stageHistory,
    performingContributorId: claim ? claim.actor_id : null,
    performingEmployee: contribution
      ? (JSON.parse(contribution.payload) as ContributionPayload).performingEmployee
      : null,
    ...fields,
  };
}

export function findAuthorization(db: DatabaseSync, authorizationId: string): Authorization | null {
  return foldAuthorization(authorizationId, readTransitions(db, authorizationId));
}

/**
 * Discharges a draft into the log (ADR-0009): appends the one transition
 * that brings the authorization into existence, carrying the draft's
 * complete contents as its payload. Everything after this reads back from
 * this row and whatever is appended after it - nothing about the
 * authorization is stored anywhere else.
 */
export function appendInitiationTransition(
  db: DatabaseSync,
  input: { actorId: string; occurredAt: string; fields: AuthorizationFields },
): Authorization {
  const authorizationId = `authorization-${randomUUID()}`;
  const transitionId = `transition-${randomUUID()}`;
  const payload: InitiationPayload = { fields: input.fields };
  db.prepare(
    `INSERT INTO transitions (id, authorization_id, kind, actor_id, occurred_at, payload)
     VALUES (?, ?, 'initiation', ?, ?, ?)`,
  ).run(transitionId, authorizationId, input.actorId, input.occurredAt, JSON.stringify(payload));
  return findAuthorization(db, authorizationId)!;
}

/** The system's arrival and notification, back to back, for a stage newly
 *  reached. Never the first stage - that one is initiation's own timestamp
 *  (see `foldStageHistory`'s header). */
function appendStageArrival(
  db: DatabaseSync,
  authorizationId: string,
  stageId: StageId,
  occurredAt: string,
): void {
  const payload: StagePayload = { stageId };
  db.prepare(
    `INSERT INTO transitions (id, authorization_id, kind, actor_id, occurred_at, payload)
     VALUES (?, ?, 'arrival', ?, ?, ?)`,
  ).run(`transition-${randomUUID()}`, authorizationId, SYSTEM_PARTICIPANT_ID, occurredAt, JSON.stringify(payload));
  db.prepare(
    `INSERT INTO transitions (id, authorization_id, kind, actor_id, occurred_at, payload)
     VALUES (?, ?, 'notification', ?, ?, ?)`,
  ).run(`transition-${randomUUID()}`, authorizationId, SYSTEM_PARTICIPANT_ID, occurredAt, JSON.stringify(payload));
}

/** The one-off notification a submitter's named performing-side contact gets
 *  on arrival at the performing-department stage (#56, CONTEXT.md: "Claim" -
 *  "a submitter may name a performing-side contact, but that only adds a
 *  notification - the department queue stays authoritative"). Recorded as
 *  its own transition kind, distinct from the role@department `notification`
 *  `appendStageArrival` writes, because it names an individual rather than a
 *  role and carries no timestamp pair of its own - there is nothing for a
 *  contact to resolve. */
function appendContactNotification(
  db: DatabaseSync,
  authorizationId: string,
  contact: string,
  occurredAt: string,
): void {
  db.prepare(
    `INSERT INTO transitions (id, authorization_id, kind, actor_id, occurred_at, payload)
     VALUES (?, ?, 'contact-notification', ?, ?, ?)`,
  ).run(
    `transition-${randomUUID()}`,
    authorizationId,
    SYSTEM_PARTICIPANT_ID,
    occurredAt,
    JSON.stringify({ contact }),
  );
}

/** Whether `stageId` is the performing-department stage - checked by id
 *  rather than by importing `relay/config.ts`'s stage kind here, so this
 *  module stays free of the relay configuration the way it was before #56
 *  (`nextStageId` above already reads `RELAY_CONFIG` for ordering only). */
const PERFORMING_DEPARTMENT_STAGE_ID: StageId = "performing-department";

/**
 * The relay's one advancing act built so far (#55): an Approver signs off on
 * the stage an authorization currently sits at, and it moves to whatever the
 * relay configuration names next - arriving there in the same transaction
 * (ADR-0009's discipline for any multi-statement write here), so a crash
 * between the acknowledgement and the next stage's arrival cannot leave a
 * stage resolved with nowhere current to point to. Which stage is being
 * acknowledged is read from the authorization itself, not taken from the
 * caller - the service checks the caller belongs there (`isQueuedFor` in
 * `queues/index.ts`) before this is reached.
 */
export function appendAcknowledgementTransition(
  db: DatabaseSync,
  input: { authorizationId: string; actorId: string; occurredAt: string },
): Authorization {
  const before = findAuthorization(db, input.authorizationId);
  if (!before) throw new Error(`No authorization with id "${input.authorizationId}".`);
  const stageId = before.currentStageId;

  db.exec("BEGIN");
  try {
    const payload: StagePayload = { stageId };
    db.prepare(
      `INSERT INTO transitions (id, authorization_id, kind, actor_id, occurred_at, payload)
       VALUES (?, ?, 'acknowledgement', ?, ?, ?)`,
    ).run(`transition-${randomUUID()}`, input.authorizationId, input.actorId, input.occurredAt, JSON.stringify(payload));

    const upcoming = nextStageId(stageId);
    if (upcoming !== stageId) {
      appendStageArrival(db, input.authorizationId, upcoming, input.occurredAt);
      if (upcoming === PERFORMING_DEPARTMENT_STAGE_ID && before.performingContact) {
        appendContactNotification(db, input.authorizationId, before.performingContact, input.occurredAt);
      }
    }
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }

  return findAuthorization(db, input.authorizationId)!;
}

/**
 * A contributor claiming the performing-department stage (#56, CONTEXT.md:
 * "Claim"): names them as the authorization's performing contributor. Does
 * not resolve the stage or move the authorization anywhere - it only records
 * who owns it, the way a claim in the domain always has. The service checks
 * eligibility (`isQueuedForClaim` in `queues/index.ts`) before this is
 * reached; this function trusts the caller the same way
 * `appendAcknowledgementTransition` does.
 */
export function appendClaimTransition(
  db: DatabaseSync,
  input: { authorizationId: string; actorId: string; occurredAt: string },
): Authorization {
  db.prepare(
    `INSERT INTO transitions (id, authorization_id, kind, actor_id, occurred_at, payload)
     VALUES (?, ?, 'claim', ?, ?, '{}')`,
  ).run(`transition-${randomUUID()}`, input.authorizationId, input.actorId, input.occurredAt);
  return findAuthorization(db, input.authorizationId)!;
}

/**
 * The performing contributor completing the performing-department stage
 * (#56, BDR-0003: "complete a contribution stage"): records the employee who
 * will perform the work and resolves the stage, exactly as an acknowledgement
 * does for an approval stage - same transaction discipline, same
 * `nextStageId` routing. Who may contribute, and that the authorization sits
 * at this stage at all, is the service's job to have already checked.
 */
export function appendContributionTransition(
  db: DatabaseSync,
  input: { authorizationId: string; actorId: string; occurredAt: string; performingEmployee: string },
): Authorization {
  const before = findAuthorization(db, input.authorizationId);
  if (!before) throw new Error(`No authorization with id "${input.authorizationId}".`);
  const stageId = before.currentStageId;

  db.exec("BEGIN");
  try {
    const payload: ContributionPayload = { stageId, performingEmployee: input.performingEmployee };
    db.prepare(
      `INSERT INTO transitions (id, authorization_id, kind, actor_id, occurred_at, payload)
       VALUES (?, ?, 'contribution', ?, ?, ?)`,
    ).run(`transition-${randomUUID()}`, input.authorizationId, input.actorId, input.occurredAt, JSON.stringify(payload));

    const upcoming = nextStageId(stageId);
    if (upcoming !== stageId) appendStageArrival(db, input.authorizationId, upcoming, input.occurredAt);
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }

  return findAuthorization(db, input.authorizationId)!;
}

/**
 * Every initiated authorization there is - what a queue is filtered from
 * (#55). "Holds live work only" is trivially true today: nothing here can
 * yet reach a terminal state (completion, withdrawal, revocation are later
 * tickets), so every initiated authorization is in-flight work.
 */
export function listAuthorizations(db: DatabaseSync): Authorization[] {
  const rows = db
    .prepare("SELECT DISTINCT authorization_id FROM transitions WHERE kind = 'initiation'")
    .all() as { authorization_id: string }[];
  return rows.map((row) => findAuthorization(db, row.authorization_id)!);
}
