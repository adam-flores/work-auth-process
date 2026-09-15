import type { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import type { StageId } from "../guidance/content.ts";
import { RELAY_CONFIG } from "../relay/config.ts";
import type { Resource } from "../drafts/index.ts";
import type { FundingType, LocationType } from "../shared/constants.ts";

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

export type Authorization = AuthorizationFields & {
  id: string;
  submitterId: string;
  currentStageId: StageId;
  initiatedAt: string;
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

function readTransitions(db: DatabaseSync, authorizationId: string): TransitionRow[] {
  return db
    .prepare("SELECT * FROM transitions WHERE authorization_id = ? ORDER BY seq")
    .all(authorizationId) as TransitionRow[];
}

/**
 * No transition kind advancing a stage exists yet - acknowledging (#55) and
 * skipping a gate (a later ticket) are what will append one. Until then this
 * always resolves to the relay's first entry, but it is written to keep
 * working once those kinds start appearing in the log: it finds the
 * furthest-along stage any such transition names and reports whatever the
 * relay configuration says comes next.
 */
const ADVANCING_KINDS = new Set(["acknowledgement", "gate-skip"]);

function foldCurrentStage(transitions: TransitionRow[]): StageId {
  let resolvedIndex = -1;
  for (const row of transitions) {
    if (!ADVANCING_KINDS.has(row.kind)) continue;
    const payload = JSON.parse(row.payload) as { stageId: StageId };
    const index = RELAY_CONFIG.findIndex((stage) => stage.id === payload.stageId);
    if (index > resolvedIndex) resolvedIndex = index;
  }
  const nextIndex = Math.min(resolvedIndex + 1, RELAY_CONFIG.length - 1);
  return RELAY_CONFIG[nextIndex]!.id;
}

function foldAuthorization(authorizationId: string, transitions: TransitionRow[]): Authorization | null {
  const initiation = transitions.find((row) => row.kind === "initiation");
  if (!initiation) return null;
  const { fields } = JSON.parse(initiation.payload) as InitiationPayload;
  return {
    id: authorizationId,
    submitterId: initiation.actor_id,
    initiatedAt: initiation.occurred_at,
    currentStageId: foldCurrentStage(transitions),
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
