import type { DatabaseSync } from "node:sqlite";
import { listAllAuthorizations } from "../authorizations/index.ts";
import type { Authorization, StageVisit } from "../authorizations/index.ts";
import { RELAY_CONFIG } from "../relay/config.ts";
import type { StageId } from "../guidance/content.ts";

/**
 * Measures (#66, BDR-0006, ADR-0006): M1-M3 and the held / awaiting-correction
 * / re-review decompositions, each written once here so the insights
 * dashboard and anything else that reports cannot keep a second copy that
 * drifts from it. Every figure is a fold over `listAllAuthorizations` - the
 * same reader the master dashboard uses - and nothing here is a stored
 * column (ADR-0004, ADR-0008).
 *
 * Referrals are never read: BDR-0011 excludes them from every measure,
 * aggregate counts included, and no field on `Authorization` here is ever
 * keyed by a participant id - a stage's time is attributed to the stage, not
 * to whoever happened to be acting on it (BDR-0006: "the dashboard measures
 * the process rather than the people").
 */

function ms(from: string, to: string): number {
  return new Date(to).getTime() - new Date(from).getTime();
}

/** Total time `authorization` was on hold, overlapping the half-open window
 *  `[from, to)` - clipped at both ends, so a hold that opened before `from`
 *  or is still open when `to` arrives only counts the part inside the
 *  window. This is what keeps held time out of both a stage's own clock and
 *  end-to-end cycle time (BDR-0006: "excluded from cycle time"), without
 *  reading the hold log a second time for each. */
function heldMsWithin(authorization: Authorization, from: string, to: string): number {
  const fromMs = new Date(from).getTime();
  const toMs = new Date(to).getTime();
  let total = 0;
  for (const interval of authorization.holdIntervals) {
    const start = Math.max(fromMs, new Date(interval.heldAt).getTime());
    const releasedMs = interval.releasedAt ? new Date(interval.releasedAt).getTime() : toMs;
    const end = Math.min(toMs, releasedMs);
    if (end > start) total += end - start;
  }
  return total;
}

/** The stage visit that was current when `at` happened: the visit of
 *  `stageId` with the latest `arrivedAt` at or before `at`. A correction
 *  request can only ever be raised against the stage an authorization
 *  currently sits at (`service/index.ts`'s `requestCorrection`), so this is
 *  unambiguous however many times the stage is later re-entered - the visit
 *  a later re-review adds always arrives *after* the correction that was
 *  attributed to the one before it. */
function visitActiveAt(authorization: Authorization, stageId: StageId, at: string): StageVisit | undefined {
  const atMs = new Date(at).getTime();
  let latest: StageVisit | undefined;
  for (const visit of authorization.stageHistory) {
    if (visit.stageId !== stageId) continue;
    if (new Date(visit.arrivedAt).getTime() > atMs) continue;
    if (!latest || new Date(visit.arrivedAt).getTime() > new Date(latest.arrivedAt).getTime()) latest = visit;
  }
  return latest;
}

/** Which of a stage's two kinds of occurrence a visit is - a fresh arrival
 *  the first time an authorization reaches it, or a re-review the second
 *  time and every time after (#60, BDR-0006: "a re-entered stage is a
 *  separate occurrence"). */
export type Occurrence = "first-pass" | "re-review";

export type StageOccurrenceMeasure = {
  stageId: StageId;
  occurrence: Occurrence;
  /** How many resolved visits contributed to this line. A visit still open
   *  (`resolvedAt === null`) has no final elapsed time yet and is left out,
   *  the same way `listAllAuthorizations` folds every authorization
   *  regardless of whether it has finished. */
  visitCount: number;
  /** Total time these visits spent awaiting a correction they raised
   *  themselves - included in the stage's own clock (BDR-0006: "the days it
   *  costs stay attached to the stage that found it"). */
  awaitingCorrectionMs: number;
  /** Total elapsed time attributable to the approver holding the work: each
   *  visit's span, minus whatever of it was a formal hold and minus whatever
   *  of it was spent awaiting correction. */
  approverMs: number;
};

export type Measures = {
  /** Time in each stage, decomposed and separated into first-pass and
   *  re-review occurrences (#96), in relay order. */
  stageOccurrences: StageOccurrenceMeasure[];
  /** Time on hold, reported on its own rather than folded into any stage's
   *  clock or into M2 (BDR-0006: "reported separately"). */
  heldTime: { authorizationCount: number; totalMs: number };
  /** M1: the share of completed authorizations that never had a correction
   *  request raised against them. */
  m1ZeroCorrectionShare: { completedCount: number; zeroCorrectionCount: number; share: number | null };
  /** M2: average cycle time from initiation to completion, held time
   *  excluded - every occurrence of every stage included, first-pass and
   *  re-review alike, since the total stays honest even where the
   *  attribution does not (BDR-0006). */
  m2CycleTime: { completedCount: number; averageMs: number | null };
  /**
   * M3: correction requests per authorization. Unlike M1, whose own name
   * scopes it to *completed* authorizations, M3 carries no such
   * qualification (`docs/business-case.md` §7) - an error is counted the
   * moment a stage finds it, not deferred until the authorization finishes,
   * so the denominator here is every authorization ever initiated,
   * regardless of whether it has completed, is still moving, or ended in a
   * withdrawal or a revocation.
   */
  m3CorrectionsPerAuthorization: {
    authorizationCount: number;
    totalCorrectionRequests: number;
    average: number | null;
  };
};

export function computeMeasures(db: DatabaseSync): Measures {
  const authorizations = listAllAuthorizations(db);

  const buckets = new Map<string, { visitCount: number; awaitingCorrectionMs: number; approverMs: number }>();
  function bucket(stageId: StageId, occurrence: Occurrence) {
    const key = `${stageId}:${occurrence}`;
    let found = buckets.get(key);
    if (!found) {
      found = { visitCount: 0, awaitingCorrectionMs: 0, approverMs: 0 };
      buckets.set(key, found);
    }
    return found;
  }

  let heldAuthorizationCount = 0;
  let totalHeldMs = 0;
  let completedCount = 0;
  let zeroCorrectionCount = 0;
  let cycleTimeTotalMs = 0;
  let totalCorrectionRequests = 0;

  for (const authorization of authorizations) {
    totalCorrectionRequests += authorization.correctionHistory.length;

    if (authorization.holdIntervals.length > 0) {
      heldAuthorizationCount += 1;
      const now = new Date().toISOString();
      for (const interval of authorization.holdIntervals) {
        totalHeldMs += ms(interval.heldAt, interval.releasedAt ?? now);
      }
    }

    // Every closed correction round, attributed to the stage visit that was
    // current when it was raised - an outstanding round has not yet cost
    // its stage anything measurable, so it contributes nothing here. Kept
    // as its own pass, separate from the resolved-visit loop below: a
    // correction can reach back and re-review an earlier stage while the
    // stage that raised it is itself still unresolved, and forward
    // progression later resumes that stage as a documented fresh arrival
    // rather than the same visit (`authorizations/index.ts`'s
    // `arriveAndSkipGates`: "never resolved, and not the live position").
    // That original visit then never gets a `resolvedAt` of its own, so its
    // awaiting-correction time has to be credited here, on the visit that
    // was actually open when the round was raised, rather than folded in
    // only for visits the loop below happens to see resolve.
    const awaitingByVisit = new Map<StageVisit, number>();
    for (const round of authorization.correctionHistory) {
      if (round.correctedAt === null) continue;
      const visit = visitActiveAt(authorization, round.stageId, round.requestedAt);
      if (!visit) continue;
      const roundMs = ms(round.requestedAt, round.correctedAt);
      awaitingByVisit.set(visit, (awaitingByVisit.get(visit) ?? 0) + roundMs);
      bucket(visit.stageId, visit.reReviewCause ? "re-review" : "first-pass").awaitingCorrectionMs += roundMs;
    }

    for (const visit of authorization.stageHistory) {
      if (visit.resolvedAt === null) continue;
      const occurrence: Occurrence = visit.reReviewCause ? "re-review" : "first-pass";
      const b = bucket(visit.stageId, occurrence);
      const elapsedMs = ms(visit.arrivedAt, visit.resolvedAt);
      const heldOverlapMs = heldMsWithin(authorization, visit.arrivedAt, visit.resolvedAt);
      const awaitingMs = awaitingByVisit.get(visit) ?? 0;
      b.visitCount += 1;
      b.approverMs += Math.max(0, elapsedMs - heldOverlapMs - awaitingMs);
    }

    if (authorization.chargeNumber !== null) {
      completedCount += 1;
      if (authorization.correctionHistory.length === 0) zeroCorrectionCount += 1;

      const completedAt = authorization.stageHistory[authorization.stageHistory.length - 1]!.resolvedAt!;
      const heldMs = heldMsWithin(authorization, authorization.initiatedAt, completedAt);
      cycleTimeTotalMs += ms(authorization.initiatedAt, completedAt) - heldMs;
    }
  }

  const stageOccurrences: StageOccurrenceMeasure[] = RELAY_CONFIG.flatMap((stage) =>
    (["first-pass", "re-review"] as const).map((occurrence) => {
      const b = bucket(stage.id, occurrence);
      return { stageId: stage.id, occurrence, ...b };
    }),
  );

  return {
    stageOccurrences,
    heldTime: { authorizationCount: heldAuthorizationCount, totalMs: totalHeldMs },
    m1ZeroCorrectionShare: {
      completedCount,
      zeroCorrectionCount,
      share: completedCount > 0 ? zeroCorrectionCount / completedCount : null,
    },
    m2CycleTime: {
      completedCount,
      averageMs: completedCount > 0 ? cycleTimeTotalMs / completedCount : null,
    },
    m3CorrectionsPerAuthorization: {
      authorizationCount: authorizations.length,
      totalCorrectionRequests,
      average: authorizations.length > 0 ? totalCorrectionRequests / authorizations.length : null,
    },
  };
}
