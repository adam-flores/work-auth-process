import type { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import type { DraftFieldKey, StageId } from "../guidance/content.ts";
import { RELAY_CONFIG, isGateStage } from "../relay/config.ts";
import type { GateStage, RelayStage } from "../relay/config.ts";
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
 * Every field a correction request may name (#59): every field a draft
 * carries, plus `performingEmployee` - the one field the performing
 * contributor supplies rather than the submitter (#56), and therefore the
 * one case BDR-0005 means by "the performing side" when it says who
 * corrects what (`correctionOwner` below). Every other field, the
 * `performing`-prefixed named approvers included, is entered by the
 * submitter at initiation - BDR-0013: naming them "is the requesting side
 * saying who it expects to handle this" - so it is the submitter's to
 * correct, same as any other field they entered.
 */
export type CorrectableFieldKey = DraftFieldKey | "performingEmployee";

/** A correction request outstanding against the stage an authorization
 *  currently sits at (#59, BDR-0005) - `null` once a correction resolves
 *  it. Read from the log, never stored as a state of its own
 *  (`Authorization.awaitingCorrection` below). */
export type CorrectionRequest = {
  fields: CorrectableFieldKey[];
  comment: string;
  requestedBy: string;
  requestedAt: string;
};

/**
 * Which of the two things moved beneath an approver who already acted (#60,
 * ADR-0004, ADR-0005, CONTEXT.md: "Re-review"): the relay's *configuration*,
 * or the *data* a correction changed. Both share one mechanism and differ
 * only in this - the approver is told which.
 */
export type ReReviewCause = "correction" | "configuration-change";

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
  /** Set when this visit re-entered a stage the authorization already
   *  passed (#60) rather than arriving fresh - which of the two causes
   *  applied. `undefined` for a plain arrival, the relay's first stage
   *  included. */
  reReviewCause?: ReReviewCause;
};

/** A department's three levels, trimmed to id and name (ADR-0007) - what a
 *  terminal transition freezes onto the record and what a live read derives
 *  from `resolveDepartment` on the fly. Structurally compatible with
 *  `ResolvedDepartment` (`hierarchy/index.ts`) without importing it: this
 *  module stays free of the hierarchy the way it always has, and takes an
 *  already-resolved department in rather than resolving one itself. */
export type FrozenClassification = {
  department: { id: string; name: string };
  division: { id: string; name: string };
  legalEntity: { id: string; name: string };
};

/** The three resolved levels for both sides, in the shape a terminal
 *  transition freezes and a live read derives (ADR-0007). */
export function classificationOf(department: {
  id: string;
  name: string;
  division: { id: string; name: string };
  legalEntity: { id: string; name: string };
}): FrozenClassification {
  return {
    department: { id: department.id, name: department.name },
    division: { id: department.division.id, name: department.division.name },
    legalEntity: { id: department.legalEntity.id, name: department.legalEntity.name },
  };
}

/** One span the authorization spent on hold (#61, CONTEXT.md: "On hold"):
 *  `releasedAt` is null while the span is still open, exactly as
 *  `StageVisit.resolvedAt` is while a stage is still current. Held time is
 *  never folded into a stage's own clock - it is reported separately
 *  (BDR-0006) - so these spans are read alongside `stageHistory` rather than
 *  merged into it. */
export type HoldInterval = { heldAt: string; releasedAt: string | null };

/** One referral (#62, BDR-0011): whoever holds an authorization at their
 *  stage showing it to a named colleague, to ask what they cannot answer
 *  themselves. Notifies and records, and does nothing else - it moves
 *  nothing, names no owner, and grants the colleague no power to act. Every
 *  one is kept, in order; a referral can recur any number of times over an
 *  authorization's life, the same way a hold can. */
export type Referral = { colleagueId: string; referredBy: string; referredAt: string };

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
  /** Whether the stage `currentStageId` names is awaiting correction (#59,
   *  BDR-0005, CONTEXT.md: "awaiting correction ... is a condition of a
   *  stage rather than a state of the authorization") - folded from the log
   *  exactly like everything else here, never a stored flag. */
  awaitingCorrection: boolean;
  /** The outstanding correction request, while `awaitingCorrection` is
   *  true; `null` the instant a correction resolves it. */
  correctionRequest: CorrectionRequest | null;
  /** Whether the stage `currentStageId` names was re-entered rather than
   *  freshly arrived at (#60, CONTEXT.md: "Re-review") - folded from
   *  whether its visit carries a `reReviewCause`, the same way
   *  `awaitingCorrection` folds from the correction state. */
  isReReview: boolean;
  /** Which of the two causes re-entered the current stage, while
   *  `isReReview` is true; `null` otherwise. */
  reReviewCause: ReReviewCause | null;
  /** The charge number the Charge Number Admin minted (CONTEXT.md: "Charge
   *  number"), `null` until minting. Its existence is what completion means
   *  (BDR-0003: "the authorization completes because a charge number
   *  exists, not because a final judgement was rendered") - there is no
   *  separate stored state for completion to drift from this. */
  chargeNumber: string | null;
  /** The three resolved levels for each side, frozen at the instant a
   *  terminal transition is appended - completion (minting) or withdrawal
   *  today, revocation once #64 builds it (ADR-0007) - `null` while the
   *  authorization is still live, at which point a caller resolves
   *  classification from the hierarchy instead (`resolveDepartment`) and
   *  never reads this. */
  classification: { requesting: FrozenClassification; performing: FrozenClassification } | null;
  /** Every span the submitter has held this authorization for (#61), in the
   *  order they occurred - a hold and the release that closes it are each
   *  their own transition, folded the same way a correction request and its
   *  correction are (`foldCorrectionState` below), except a hold can recur
   *  any number of times rather than at most once. */
  holdIntervals: HoldInterval[];
  /** Whether the authorization is currently on hold - the last interval in
   *  `holdIntervals` still open (CONTEXT.md: "In nobody's queue while
   *  held"). Folded rather than stored, the same discipline `awaitingCorrection`
   *  already follows. */
  onHold: boolean;
  /** When the submitter withdrew this authorization (#61, CONTEXT.md:
   *  "Withdrawn"), `null` while it is still live. Terminal, like
   *  `chargeNumber` existing - the two are mutually exclusive, and
   *  `classification` above is frozen by whichever of them happens. */
  withdrawnAt: string | null;
  /** Every colleague this authorization has been shown to (#62, BDR-0011),
   *  in the order it happened - readable in the authorization's history and
   *  excluded from every measure, aggregate counts included, so nothing here
   *  is ever folded down to a total. */
  referrals: Referral[];
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
type ReReviewPayload = { stageId: StageId; cause: ReReviewCause };
/** A relay-configuration edit's own marker (#60, ADR-0004, ADR-0005), holding
 *  every stage id it touched - the counterpart to a correction's own
 *  `fields`, which already serves this same purpose for that cause without
 *  a separate row (`CorrectionPayload` below). Read by `reReviewCauseSince`
 *  whenever forward progression reaches an already-passed stage, however
 *  many calls later that turns out to be. */
type ConfigurationChangePayload = { changedStageIds: StageId[] };
type ContributionPayload = { stageId: StageId; performingEmployee: string };
type CorrectionRequestPayload = { stageId: StageId; fields: CorrectableFieldKey[]; comment: string };
/** `performingEmployee` sits outside `AuthorizationFields` (it is not a
 *  draft field), so a correction's payload carries it alongside a partial
 *  of the rest rather than folding it into that type. */
type CorrectionPayload = {
  stageId: StageId;
  fields: Partial<AuthorizationFields> & { performingEmployee?: string };
};
/** BDR-0003 and ADR-0004 require "the value that decided a skip" - read
 *  generically off the gate's own `fieldDependencies` rather than naming
 *  Contracts or Global Trade's fields here, so a relay-configuration edit to
 *  what a gate reads (BDR-0014) is the whole of the change this needs. */
type GateSkipPayload = { stageId: StageId; fields: Partial<AuthorizationFields> };
/** The Charge Number Admin minting a charge number (#58): the terminal
 *  transition ADR-0007 requires to carry the three resolved levels for each
 *  side, frozen at this instant rather than left to be re-derived from a
 *  hierarchy that may since have changed. */
type CompletionPayload = {
  stageId: StageId;
  chargeNumber: string;
  classification: { requesting: FrozenClassification; performing: FrozenClassification };
};
/** The submitter withdrawing an authorization (#61, CONTEXT.md: "Withdrawn"):
 *  a terminal transition like completion's, so it carries the same frozen
 *  classification (ADR-0007) rather than leaving it to be re-derived from a
 *  hierarchy that may since have changed. No `stageId`, unlike completion's
 *  payload - withdrawal does not resolve a stage, it ends the authorization
 *  wherever it happens to sit. */
type WithdrawalPayload = {
  classification: { requesting: FrozenClassification; performing: FrozenClassification };
};
/** Whoever holds an authorization at their stage referring it to a named
 *  colleague (#62, BDR-0011) - just who, since the mechanism carries no
 *  comment of its own the way a correction request's does. */
type ReferralPayload = { colleagueId: string };

function readTransitions(db: DatabaseSync, authorizationId: string): TransitionRow[] {
  return db
    .prepare("SELECT * FROM transitions WHERE authorization_id = ? ORDER BY seq")
    .all(authorizationId) as TransitionRow[];
}

/** The stage that follows `stageId` in the relay - clamped to the last entry,
 *  the mint stage (#58), which has nowhere further to advance to. Resolving
 *  it appends a completion transition instead of an arrival
 *  (`appendCompletionTransition` below): completion is read back from
 *  `chargeNumber` existing, not from `currentStageId` moving anywhere else. */
function nextStageId(stageId: StageId): StageId {
  const index = RELAY_CONFIG.findIndex((stage) => stage.id === stageId);
  const nextIndex = Math.min(index + 1, RELAY_CONFIG.length - 1);
  return RELAY_CONFIG[nextIndex]!.id;
}

/**
 * What resolves a stage - acknowledging it (#55), a contributor completing
 * the performing-department stage (#56), or skipping a gate (#57). Kept as a
 * set for the same reason it was before any but the first kind existed: it
 * is what `foldStageHistory` below reads to fill in a stage's `resolvedAt`,
 * and each later kind fills that in exactly like an acknowledgement does.
 */
const RESOLVING_KINDS = new Set(["acknowledgement", "contribution", "gate-skip", "completion"]);

/**
 * Every stage reached so far, each with its own three timestamps (#55,
 * BDR-0006). The first stage's arrival and notification are not separate
 * rows - initiation discharges the draft and arrives it at the relay's first
 * entry in the same instant, so `initiation`'s own timestamp serves both.
 * Every later stage gets an explicit `arrival` transition, appended the
 * moment the one before it resolves (`appendAcknowledgementTransition`
 * below), immediately followed by a `notification` transition - the system
 * notifies on arrival, so the two are recorded back to back rather than
 * carrying a fabricated delay between them. A `re-review` transition (#60)
 * is a third way a visit begins - the same single-row shorthand the first
 * stage's own visit already uses, since there is nothing a separate
 * notification would add.
 *
 * Held as an array pushed to in log order, not a map keyed by stage id -
 * re-review means a stage can appear more than once (ADR-0005: "only the
 * latest occurrence is live"), so `notification` and a resolving transition
 * are matched against whichever visit is last, which is always the one they
 * were appended immediately after.
 */
function foldStageHistory(transitions: TransitionRow[], initiation: TransitionRow): StageVisit[] {
  const first = RELAY_CONFIG[0]!.id;
  const visits: StageVisit[] = [
    { stageId: first, arrivedAt: initiation.occurred_at, notifiedAt: initiation.occurred_at, resolvedAt: null },
  ];

  for (const row of transitions) {
    if (row.kind === "arrival") {
      const { stageId } = JSON.parse(row.payload) as StagePayload;
      visits.push({ stageId, arrivedAt: row.occurred_at, notifiedAt: row.occurred_at, resolvedAt: null });
    } else if (row.kind === "re-review") {
      const { stageId, cause } = JSON.parse(row.payload) as ReReviewPayload;
      visits.push({
        stageId,
        arrivedAt: row.occurred_at,
        notifiedAt: row.occurred_at,
        resolvedAt: null,
        reReviewCause: cause,
      });
    } else if (row.kind === "notification") {
      const { stageId } = JSON.parse(row.payload) as StagePayload;
      const visit = visits[visits.length - 1];
      if (visit && visit.stageId === stageId) visit.notifiedAt = row.occurred_at;
    } else if (RESOLVING_KINDS.has(row.kind)) {
      const { stageId } = JSON.parse(row.payload) as StagePayload;
      const visit = visits[visits.length - 1];
      if (visit && visit.stageId === stageId) visit.resolvedAt = row.occurred_at;
    }
  }

  return visits;
}

/**
 * A correction request, and the correction that resolves it, are each
 * appended once per round and never more than one is outstanding at a time
 * (`service/index.ts`'s `isQueuedFor` refuses to raise a second while the
 * first still stands) - so "the last of either kind, in log order" is
 * enough to say whether the current stage is awaiting correction, without
 * needing to pair a particular request up with the correction that closed
 * it. Every correction along the way also updates the field values a later
 * read of the authorization sees - the latest correction of a given field
 * wins, the same as any other fold here.
 */
function foldCorrectionState(transitions: TransitionRow[]): {
  fieldOverrides: Partial<AuthorizationFields>;
  performingEmployeeOverride: string | undefined;
  outstanding: CorrectionRequest | null;
} {
  let fieldOverrides: Partial<AuthorizationFields> = {};
  let performingEmployeeOverride: string | undefined;
  let outstanding: CorrectionRequest | null = null;

  for (const row of transitions) {
    if (row.kind === "correction-request") {
      const { fields, comment } = JSON.parse(row.payload) as CorrectionRequestPayload;
      outstanding = { fields, comment, requestedBy: row.actor_id, requestedAt: row.occurred_at };
    } else if (row.kind === "correction") {
      const { performingEmployee, ...rest } = (JSON.parse(row.payload) as CorrectionPayload).fields;
      fieldOverrides = { ...fieldOverrides, ...rest };
      if (performingEmployee !== undefined) performingEmployeeOverride = performingEmployee;
      outstanding = null;
    }
  }

  return { fieldOverrides, performingEmployeeOverride, outstanding };
}

/**
 * Every span the authorization has been held for (#61): a `hold` opens one,
 * the `release` that follows closes it, and there is never more than one
 * open at a time - `service/index.ts`'s `hold` and `release` each refuse to
 * repeat themselves (`ALREADY_ON_HOLD`, `NOT_ON_HOLD`) before either of
 * these is ever appended. Unlike `foldCorrectionState`, which only ever
 * needs the latest of either kind, a hold can recur any number of times
 * over an authorization's life and every span is kept - BDR-0006 needs the
 * total held time, not just whether it is currently held.
 */
function foldHoldIntervals(transitions: TransitionRow[]): HoldInterval[] {
  const intervals: HoldInterval[] = [];
  for (const row of transitions) {
    if (row.kind === "hold") {
      intervals.push({ heldAt: row.occurred_at, releasedAt: null });
    } else if (row.kind === "release") {
      const open = intervals[intervals.length - 1];
      if (open && open.releasedAt === null) open.releasedAt = row.occurred_at;
    }
  }
  return intervals;
}

/**
 * Every referral appended so far (#62) - unlike a hold or a correction
 * request, a referral never resolves anything, so there is nothing to pair a
 * later transition against: every `referral` row is its own complete record,
 * kept in log order rather than folded down to a latest one.
 */
function foldReferrals(transitions: TransitionRow[]): Referral[] {
  const referrals: Referral[] = [];
  for (const row of transitions) {
    if (row.kind === "referral") {
      const { colleagueId } = JSON.parse(row.payload) as ReferralPayload;
      referrals.push({ colleagueId, referredBy: row.actor_id, referredAt: row.occurred_at });
    }
  }
  return referrals;
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
  const { fieldOverrides, performingEmployeeOverride, outstanding } = foldCorrectionState(transitions);

  // Minting is recorded once and never more than once - completion is
  // terminal, so there is nothing after it to append (`appendCompletionTransition`
  // below trusts the service to have refused a second attempt via
  // `isQueuedForMint`, the same trust `appendClaimTransition` extends).
  const completion = transitions.find((row) => row.kind === "completion");
  const completionPayload = completion ? (JSON.parse(completion.payload) as CompletionPayload) : null;

  // Withdrawal is likewise recorded once and never more than once - the
  // service refuses a second attempt against an already-terminal
  // authorization (`AUTHORIZATION_TERMINAL`) before this is ever appended.
  const withdrawal = transitions.find((row) => row.kind === "withdrawal");
  const withdrawalPayload = withdrawal ? (JSON.parse(withdrawal.payload) as WithdrawalPayload) : null;

  const holdIntervals = foldHoldIntervals(transitions);
  const onHold = holdIntervals.length > 0 && holdIntervals[holdIntervals.length - 1]!.releasedAt === null;

  const currentVisit = stageHistory[stageHistory.length - 1]!;

  return {
    id: authorizationId,
    submitterId: initiation.actor_id,
    initiatedAt: initiation.occurred_at,
    currentStageId: currentVisit.stageId,
    stageHistory,
    performingContributorId: claim ? claim.actor_id : null,
    performingEmployee:
      performingEmployeeOverride ??
      (contribution ? (JSON.parse(contribution.payload) as ContributionPayload).performingEmployee : null),
    awaitingCorrection: outstanding !== null,
    correctionRequest: outstanding,
    isReReview: currentVisit.reReviewCause !== undefined,
    reReviewCause: currentVisit.reReviewCause ?? null,
    chargeNumber: completionPayload ? completionPayload.chargeNumber : null,
    classification: completionPayload
      ? completionPayload.classification
      : withdrawalPayload
        ? withdrawalPayload.classification
        : null,
    holdIntervals,
    onHold,
    withdrawnAt: withdrawal ? withdrawal.occurred_at : null,
    referrals: foldReferrals(transitions),
    ...fields,
    ...fieldOverrides,
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

/** The fields a gate's own `fieldDependencies` names, read off the
 *  authorization at the moment it decides the skip - not the fields a later
 *  edit to the relay configuration might add or remove (BDR-0014: "changing
 *  what it reads is a relay-configuration edit"). */
function gateSkipFields(fields: AuthorizationFields, stage: GateStage): Partial<AuthorizationFields> {
  return Object.fromEntries(
    stage.fieldDependencies.map((key) => [key, fields[key as keyof AuthorizationFields]]),
  ) as Partial<AuthorizationFields>;
}

/** A gate resolving itself the moment it arrives, because its condition does
 *  not hold (BDR-0014, ADR-0004: "a gate skip is an explicit transition").
 *  `system` is the actor - nobody decided this, the relay configuration
 *  did - and the payload carries the value that decided it rather than
 *  leaving the skip to be inferred later from fields that may since have
 *  changed. */
function appendGateSkipTransition(
  db: DatabaseSync,
  authorizationId: string,
  stage: GateStage,
  fields: AuthorizationFields,
  occurredAt: string,
): void {
  const payload: GateSkipPayload = { stageId: stage.id, fields: gateSkipFields(fields, stage) };
  db.prepare(
    `INSERT INTO transitions (id, authorization_id, kind, actor_id, occurred_at, payload)
     VALUES (?, ?, 'gate-skip', ?, ?, ?)`,
  ).run(`transition-${randomUUID()}`, authorizationId, SYSTEM_PARTICIPANT_ID, occurredAt, JSON.stringify(payload));
}

/** The transition that most recently resolved `stageId` - an
 *  acknowledgement, a contribution, a gate skip or a completion
 *  (`RESOLVING_KINDS`) - or `null` if nothing ever has. Carries `kind`
 *  alongside `seq` because `arriveAndSkipGates` below needs to tell a gate
 *  the system skipped, with no human ever involved, apart from a stage a
 *  human actually resolved (CONTEXT.md's "Re-review": "an authorization
 *  returning to an approver who already acted on it" - a gate nobody ever
 *  saw does not qualify). `seq` is what `reReviewCauseSince` needs an
 *  unambiguous "since" to compare later rows against. */
function lastResolutionFor(transitions: TransitionRow[], stageId: StageId): { seq: number; kind: string } | null {
  let resolution: { seq: number; kind: string } | null = null;
  for (const row of transitions) {
    if (RESOLVING_KINDS.has(row.kind)) {
      const { stageId: rowStage } = JSON.parse(row.payload) as StagePayload;
      if (rowStage === stageId) resolution = { seq: row.seq, kind: row.kind };
    }
  }
  return resolution;
}

/** Whether anything recorded after `sinceSeq` - `stage`'s last resolution -
 *  reaches `stage` again: a correction changing one of its declared
 *  dependencies, or a configuration change naming it directly (#60,
 *  ADR-0005: "one mechanism," two causes). `null` when nothing since has,
 *  which is the ordinary case for every stage a correction or
 *  configuration change does not concern. */
function reReviewCauseSince(transitions: TransitionRow[], stage: RelayStage, sinceSeq: number): ReReviewCause | null {
  for (const row of transitions) {
    if (row.seq <= sinceSeq) continue;
    if (row.kind === "correction") {
      const { fields } = JSON.parse(row.payload) as CorrectionPayload;
      if (stage.fieldDependencies.some((field) => field in fields)) return "correction";
    } else if (row.kind === "configuration-change") {
      const { changedStageIds } = JSON.parse(row.payload) as ConfigurationChangePayload;
      if (changedStageIds.includes(stage.id)) return "configuration-change";
    }
  }
  return null;
}

/**
 * Arrives an authorization at `stageId` and moves it forward from there -
 * recursively, since a company-funded, same-country authorization skips
 * both gates in the same step and there is nothing for a queue to ever show
 * it at, and since a correction or configuration change (#60) can reach
 * several already-passed stages in one call, or none. Checked fresh against
 * the authorization's live position on every step rather than a value fixed
 * once at the top of the walk, because that position can itself move
 * mid-walk: a re-review a few stages back may resolve itself immediately
 * (a gate whose condition no longer holds, `appendGateSkipTransition`
 * below), which makes wherever it auto-skips *to* the new live position
 * before this function ever reaches it. Four things can be true of
 * `stageId` when it is reached:
 *
 * - **Already the live position**: forward progression has walked all the
 *   way back to exactly where the authorization already sits, and every
 *   stage along the way was left untouched - the "disturbs nobody" case
 *   (ADR-0005) - so there is nothing to do.
 * - **Never resolved, and not the live position**: an already-arrived stage
 *   a re-progression has walked forward to pick back up after auto-passing
 *   everything unaffected in between (#60: "re-progresses it forward") -
 *   the first case above already ruled out this being a no-op, so it is
 *   recorded as a fresh arrival the same way a genuinely first-time one is,
 *   and a gate's condition is checked the same way it always was.
 * - **Resolved, and untouched since**: its earlier resolution stands -
 *   nothing is appended, and progression moves straight on to whatever
 *   comes next, silently.
 * - **Resolved, but reached again since** by a correction's changed fields
 *   or a configuration change's named stages (`reReviewCauseSince`):
 *   re-entered as a re-review carrying which cause applied, and a gate
 *   among these still has its condition re-evaluated, since that condition
 *   is defined entirely in terms of the same declared dependencies that
 *   made it a target - unless that gate's one prior resolution was the
 *   system skipping it (`lastResolutionFor`'s `kind`) and its condition now
 *   holds: nobody ever acted on it, so this is recorded as a fresh arrival
 *   rather than a re-review (CONTEXT.md: re-review is "an authorization
 *   returning to an approver who already acted on it"). Either way,
 *   progression moves on to whichever target comes next if the gate still
 *   does not run.
 */
function arriveAndSkipGates(
  db: DatabaseSync,
  authorizationId: string,
  fields: AuthorizationFields,
  stageId: StageId,
  occurredAt: string,
): void {
  if (findAuthorization(db, authorizationId)!.currentStageId === stageId) return;

  const transitions = readTransitions(db, authorizationId);
  const stage = RELAY_CONFIG.find((s) => s.id === stageId)!;
  const lastResolution = lastResolutionFor(transitions, stageId);

  if (lastResolution !== null) {
    const cause = reReviewCauseSince(transitions, stage, lastResolution.seq);
    if (cause === null) {
      const next = nextStageId(stageId);
      if (next !== stageId) arriveAndSkipGates(db, authorizationId, fields, next, occurredAt);
      return;
    }
    const skippedBySystemAndNowRunsForAHuman =
      lastResolution.kind === "gate-skip" && isGateStage(stage) && stage.condition(fields);
    if (skippedBySystemAndNowRunsForAHuman) {
      // The system skipped this gate last time - no human ever saw it, so
      // it flipping to run is a genuinely first arrival, not a return to
      // something an approver already acted on (CONTEXT.md's "Re-review").
      appendStageArrival(db, authorizationId, stageId, occurredAt);
    } else {
      appendReReviewTransition(db, authorizationId, stageId, cause, occurredAt);
    }
  } else {
    appendStageArrival(db, authorizationId, stageId, occurredAt);
  }

  if (isGateStage(stage) && !stage.condition(fields)) {
    appendGateSkipTransition(db, authorizationId, stage, fields, occurredAt);
    const next = nextStageId(stageId);
    if (next !== stageId) arriveAndSkipGates(db, authorizationId, fields, next, occurredAt);
  }
}

/** Whether `stageId` is the performing-department stage - checked by id
 *  rather than by importing `relay/config.ts`'s stage kind here, so this
 *  module stays free of the relay configuration the way it was before #56
 *  (`nextStageId` above, and now `arriveAndSkipGates`, already read
 *  `RELAY_CONFIG` for ordering and for a gate's own condition). */
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
      arriveAndSkipGates(db, input.authorizationId, before, upcoming, input.occurredAt);
      // Read back where this landed rather than trusting `upcoming` (#60):
      // a re-review can silently auto-pass straight through
      // performing-department when it was already resolved and this
      // acknowledgement's own re-progression never actually stops there, and
      // the contact should not be told about an arrival that never happened.
      const landedAt = findAuthorization(db, input.authorizationId)!.currentStageId;
      if (landedAt === PERFORMING_DEPARTMENT_STAGE_ID && before.performingContact) {
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
    if (upcoming !== stageId) arriveAndSkipGates(db, input.authorizationId, before, upcoming, input.occurredAt);
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }

  return findAuthorization(db, input.authorizationId)!;
}

/**
 * The submitter pausing their own authorization (#61, CONTEXT.md: "On
 * hold"). Does not touch the relay at all - no stage arrives, resolves, or
 * moves - it only opens a span in `holdIntervals` (`foldHoldIntervals`
 * above), which is what removes the authorization from every queue
 * (`listMyQueue` in `service/index.ts` filters on `onHold` before either
 * queue-builder below ever sees it). The service checks that the caller is
 * the submitter and that nothing is already open (`ALREADY_ON_HOLD`) before
 * this is reached, the same trust `appendClaimTransition` extends its
 * caller.
 */
export function appendHoldTransition(
  db: DatabaseSync,
  input: { authorizationId: string; actorId: string; occurredAt: string },
): Authorization {
  db.prepare(
    `INSERT INTO transitions (id, authorization_id, kind, actor_id, occurred_at, payload)
     VALUES (?, ?, 'hold', ?, ?, '{}')`,
  ).run(`transition-${randomUUID()}`, input.authorizationId, input.actorId, input.occurredAt);
  return findAuthorization(db, input.authorizationId)!;
}

/**
 * The submitter releasing a hold (#61, CONTEXT.md: "and only the submitter
 * releases it"): closes the span `appendHoldTransition` opened, which is
 * what resumes the authorization at exactly the stage it left - nothing
 * about its position ever moved, so there is nothing here to route. The
 * service checks the caller is the submitter and that a span is genuinely
 * open (`NOT_ON_HOLD`) before this is reached.
 */
export function appendReleaseTransition(
  db: DatabaseSync,
  input: { authorizationId: string; actorId: string; occurredAt: string },
): Authorization {
  db.prepare(
    `INSERT INTO transitions (id, authorization_id, kind, actor_id, occurred_at, payload)
     VALUES (?, ?, 'release', ?, ?, '{}')`,
  ).run(`transition-${randomUUID()}`, input.authorizationId, input.actorId, input.occurredAt);
  return findAuthorization(db, input.authorizationId)!;
}

/**
 * Whoever holds an authorization at their stage showing it to a named
 * colleague (#62, BDR-0011): appends a transition and changes nothing else -
 * no arrival, no resolution, no ownership named, nothing added to any queue.
 * The service checks eligibility (`isHolderOf` in `queues/index.ts`) and
 * that the colleague is a real, known participant before this is reached,
 * the same trust `appendClaimTransition` extends its caller.
 */
export function appendReferralTransition(
  db: DatabaseSync,
  input: { authorizationId: string; actorId: string; occurredAt: string; colleagueId: string },
): Authorization {
  const payload: ReferralPayload = { colleagueId: input.colleagueId };
  db.prepare(
    `INSERT INTO transitions (id, authorization_id, kind, actor_id, occurred_at, payload)
     VALUES (?, ?, 'referral', ?, ?, ?)`,
  ).run(`transition-${randomUUID()}`, input.authorizationId, input.actorId, input.occurredAt, JSON.stringify(payload));
  return findAuthorization(db, input.authorizationId)!;
}

/**
 * The Charge Number Admin minting a charge number (#58, CONTEXT.md: "the
 * role that mints the charge number and thereby completes the
 * authorization"). Terminal: unlike an acknowledgement or a contribution,
 * this does not arrive anywhere next - there is nothing after the mint
 * stage for the relay to route to, and completion is read back from
 * `chargeNumber` existing rather than from a further move
 * (`foldAuthorization` above, BDR-0003). The classification this carries is
 * whatever the caller resolved live just before calling this - the last
 * live read the record ever makes (ADR-0007) - not something this module
 * resolves itself, the same way `appendInitiationTransition` trusts the
 * fields it is handed rather than validating them again.
 */
export function appendCompletionTransition(
  db: DatabaseSync,
  input: {
    authorizationId: string;
    actorId: string;
    occurredAt: string;
    chargeNumber: string;
    classification: { requesting: FrozenClassification; performing: FrozenClassification };
  },
): Authorization {
  const before = findAuthorization(db, input.authorizationId);
  if (!before) throw new Error(`No authorization with id "${input.authorizationId}".`);

  const payload: CompletionPayload = {
    stageId: before.currentStageId,
    chargeNumber: input.chargeNumber,
    classification: input.classification,
  };
  db.prepare(
    `INSERT INTO transitions (id, authorization_id, kind, actor_id, occurred_at, payload)
     VALUES (?, ?, 'completion', ?, ?, ?)`,
  ).run(`transition-${randomUUID()}`, input.authorizationId, input.actorId, input.occurredAt, JSON.stringify(payload));
  return findAuthorization(db, input.authorizationId)!;
}

/**
 * The submitter withdrawing their own authorization (#61, CONTEXT.md:
 * "Withdrawn"). Terminal, the same as completion: nothing after it is ever
 * appended, and it does not resolve or move a stage - it ends the
 * authorization wherever it happens to sit, whether that is mid-relay or
 * on hold. The classification this carries is resolved live by the caller
 * just before calling this, exactly as `appendCompletionTransition` already
 * does, so a withdrawn record freezes the same way a completed one does
 * (ADR-0007). The service checks the caller is the submitter and that the
 * authorization is not already terminal (`AUTHORIZATION_TERMINAL`) before
 * this is reached.
 */
export function appendWithdrawalTransition(
  db: DatabaseSync,
  input: {
    authorizationId: string;
    actorId: string;
    occurredAt: string;
    classification: { requesting: FrozenClassification; performing: FrozenClassification };
  },
): Authorization {
  const payload: WithdrawalPayload = { classification: input.classification };
  db.prepare(
    `INSERT INTO transitions (id, authorization_id, kind, actor_id, occurred_at, payload)
     VALUES (?, ?, 'withdrawal', ?, ?, ?)`,
  ).run(`transition-${randomUUID()}`, input.authorizationId, input.actorId, input.occurredAt, JSON.stringify(payload));
  return findAuthorization(db, input.authorizationId)!;
}

/**
 * An Approver raising a correction request at the stage an authorization
 * currently sits at (#59, BDR-0005): names the fields at fault and carries
 * a mandatory comment. The authorization's position does not change - no
 * arrival, no resolution, nothing for a transaction to hold together - only
 * the stage's condition does, and that is read back on the next fold
 * (`foldCorrectionState` above). The service checks eligibility
 * (`isQueuedFor`) and that the named fields share one corrector
 * (`correctionOwner` below) before this is reached, the same trust
 * `appendClaimTransition` extends its caller.
 */
export function appendCorrectionRequestTransition(
  db: DatabaseSync,
  input: {
    authorizationId: string;
    actorId: string;
    occurredAt: string;
    stageId: StageId;
    fields: CorrectableFieldKey[];
    comment: string;
  },
): Authorization {
  const payload: CorrectionRequestPayload = { stageId: input.stageId, fields: input.fields, comment: input.comment };
  db.prepare(
    `INSERT INTO transitions (id, authorization_id, kind, actor_id, occurred_at, payload)
     VALUES (?, ?, 'correction-request', ?, ?, ?)`,
  ).run(`transition-${randomUUID()}`, input.authorizationId, input.actorId, input.occurredAt, JSON.stringify(payload));
  return findAuthorization(db, input.authorizationId)!;
}

/** An authorization returning to a stage it already resolved (#60, ADR-0004,
 *  ADR-0005) - one row, the same single-timestamp shorthand `foldStageHistory`
 *  gives the relay's first stage: there is nothing a separate notification
 *  would add that the arrival itself does not already say. `system` is the
 *  actor, the same as a gate skip - nobody decided this, either the
 *  correction or the configuration did. */
function appendReReviewTransition(
  db: DatabaseSync,
  authorizationId: string,
  stageId: StageId,
  cause: ReReviewCause,
  occurredAt: string,
): void {
  const payload: ReReviewPayload = { stageId, cause };
  db.prepare(
    `INSERT INTO transitions (id, authorization_id, kind, actor_id, occurred_at, payload)
     VALUES (?, ?, 're-review', ?, ?, ?)`,
  ).run(`transition-${randomUUID()}`, authorizationId, SYSTEM_PARTICIPANT_ID, occurredAt, JSON.stringify(payload));
}

/**
 * The field's owner supplying the fix (#59, CONTEXT.md: "made on the
 * authorization where it stands - nothing is resubmitted and nothing
 * leaves the relay"). Resolves the outstanding correction request the
 * instant it is appended - `foldCorrectionState` reads "the last of either
 * kind" - so the approver who raised it resumes at exactly the stage they
 * left it, with no further transition needed to get there, unless the
 * correction reaches a passed stage's declared dependencies (#60,
 * ADR-0005). Re-walking the relay from its first stage after appending the
 * correction is what finds that out: `arriveAndSkipGates` silently passes
 * through everything the correction leaves untouched, including every
 * already-resolved stage all the way up to wherever the authorization
 * already sits, so a correction that intersects nothing genuinely appends
 * nothing beyond itself. The service checks who may supply which fields
 * (`correctionOwner` below) before this is reached.
 */
export function appendCorrectionTransition(
  db: DatabaseSync,
  input: {
    authorizationId: string;
    actorId: string;
    occurredAt: string;
    stageId: StageId;
    fields: Partial<AuthorizationFields> & { performingEmployee?: string };
  },
): Authorization {
  db.exec("BEGIN");
  try {
    const payload: CorrectionPayload = { stageId: input.stageId, fields: input.fields };
    db.prepare(
      `INSERT INTO transitions (id, authorization_id, kind, actor_id, occurred_at, payload)
       VALUES (?, ?, 'correction', ?, ?, ?)`,
    ).run(`transition-${randomUUID()}`, input.authorizationId, input.actorId, input.occurredAt, JSON.stringify(payload));

    const after = findAuthorization(db, input.authorizationId)!;
    arriveAndSkipGates(db, input.authorizationId, after, RELAY_CONFIG[0]!.id, input.occurredAt);
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }

  return findAuthorization(db, input.authorizationId)!;
}

/**
 * A relay-configuration edit reaching stages an authorization has already
 * passed (#60, ADR-0004, ADR-0005's second cause: the rules changing
 * beneath an authorization rather than the data). Shares
 * `arriveAndSkipGates` with a correction's own routing - ADR-0005: "one
 * mechanism" - via the same marker-and-replay shape a correction already
 * has for free (`CorrectionPayload.fields` is that marker there;
 * `ConfigurationChangePayload` above is this cause's counterpart). There is
 * deliberately no live editor for this - a configuration edit is a code
 * change and a redeploy, not a runtime action - so this is the seam a
 * migration would call, and what a seeded test scenario exercises
 * directly, bypassing the service the way no other transition in this
 * module needs to.
 */
export function appendConfigurationChangeReReviewTransition(
  db: DatabaseSync,
  input: { authorizationId: string; occurredAt: string; changedStageIds: readonly StageId[] },
): Authorization {
  const before = findAuthorization(db, input.authorizationId);
  if (!before) throw new Error(`No authorization with id "${input.authorizationId}".`);

  db.exec("BEGIN");
  try {
    const payload: ConfigurationChangePayload = { changedStageIds: [...input.changedStageIds] };
    db.prepare(
      `INSERT INTO transitions (id, authorization_id, kind, actor_id, occurred_at, payload)
       VALUES (?, ?, 'configuration-change', ?, ?, ?)`,
    ).run(
      `transition-${randomUUID()}`,
      input.authorizationId,
      SYSTEM_PARTICIPANT_ID,
      input.occurredAt,
      JSON.stringify(payload),
    );

    arriveAndSkipGates(db, input.authorizationId, before, RELAY_CONFIG[0]!.id, input.occurredAt);
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }

  return findAuthorization(db, input.authorizationId)!;
}

/**
 * The participant a correction naming `fields` is addressed to (#59,
 * BDR-0005: "the submitter corrects it, generally - the owner of the field
 * otherwise, which on the performing side is the performing contributor").
 * `performingEmployee` is the one field the performing contributor supplies
 * (#56); every other field is entered by the submitter at initiation and
 * stays theirs to correct. `null` when the fields named span both owners -
 * a single correction request may address only one corrector
 * (`service/index.ts`'s `requestCorrection` refuses the rest at the point
 * one is raised, rather than let `correct` discover it later).
 */
export function correctionOwner(
  authorization: Authorization,
  fields: readonly CorrectableFieldKey[],
): string | null {
  const namesPerformingEmployee = fields.includes("performingEmployee");
  const namesSomethingElse = fields.some((field) => field !== "performingEmployee");
  if (namesPerformingEmployee && namesSomethingElse) return null;
  return namesPerformingEmployee ? authorization.performingContributorId : authorization.submitterId;
}

/**
 * Every initiated authorization still in flight - what a queue is filtered
 * from (#55), and today the only consumer of this function
 * (`listMyQueue` in `service/index.ts`). Completed and withdrawn
 * authorizations are excluded here rather than left for each queue
 * function in `queues/index.ts` to filter out individually (#61) -
 * revocation will join them once #64 builds it. On-hold authorizations are
 * not excluded here: holding does not end an authorization, and each queue
 * function already checks `onHold` itself, the same way each already
 * checks `awaitingCorrection`.
 *
 * Not the reader a future master dashboard (#63) can reuse - CONTEXT.md's
 * "Master dashboard" is explicit that it shows every authorization "in the
 * system," terminal ones included, which is the opposite of what a queue
 * should ever be filtered from. That surface needs its own, unfiltered
 * function; reaching for this one instead would silently hide completed
 * and withdrawn work from a view whose whole job is to show it.
 */
export function listAuthorizations(db: DatabaseSync): Authorization[] {
  const rows = db
    .prepare("SELECT DISTINCT authorization_id FROM transitions WHERE kind = 'initiation'")
    .all() as { authorization_id: string }[];
  return rows
    .map((row) => findAuthorization(db, row.authorization_id)!)
    .filter((authorization) => authorization.chargeNumber === null && authorization.withdrawnAt === null);
}
