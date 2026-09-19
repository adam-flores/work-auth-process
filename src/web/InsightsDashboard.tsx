import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "./api.ts";
import type { Measures, Occurrence, StageOccurrenceMeasure } from "./api.ts";
import type { StageId } from "../guidance/content.ts";
import { RELAY_CONFIG } from "../relay/config.ts";

/**
 * The insights dashboard (#66, BDR-0006, ADR-0006): every figure a fold over
 * the same transition log the live product writes, so the screen being right
 * is evidence the instrumentation is right. Nothing here is computed by this
 * component - it renders exactly what `api.getMeasures` returns, which is
 * `computeMeasures` in `src/measures/index.ts`, the one and only
 * implementation of M1-M3 and the decompositions.
 *
 * Admin-only is this surface's stated intent, not an enforced boundary
 * (ADR-0006) - every participant is mocked, so this renders for whoever is
 * acting rather than checking a role, the same openness the master
 * dashboard already has.
 *
 * The headline measures render as stat tiles and the per-stage breakdown as
 * a hand-built heat-tile grid (#93, ADR-0014, ADR-0016) rather than a
 * definition list and a table, so a demo audience reads the argument at a
 * glance. Every number a chart shows is also plain visible text - not a
 * pixel-only value or a separate hidden copy - so the same figure is both
 * the tile's label and its accessible name.
 */

export type InsightsDashboardProps = { actingId: string };

/** How often this tab refetches in the background, matching `MyQueue.tsx`'s
 *  `QUEUE_POLL_MS` - there is no push to stand in for here either. */
const INSIGHTS_POLL_MS = 3000;

const STAGE_LABELS: Record<StageId, string> = {
  "requesting-program-manager": "Requesting program manager",
  "requesting-finance": "Requesting finance",
  "performing-department": "Performing department",
  "performing-program-manager": "Performing program manager",
  "performing-finance": "Performing finance",
  contracts: "Contracts (gate)",
  "global-trade": "Global Trade (gate)",
  "charge-number-admin": "Charge number admin",
};

const OCCURRENCE_LABELS: Record<Occurrence, string> = {
  "first-pass": "First pass",
  "re-review": "Re-review",
};

function formatDuration(ms: number): string {
  const days = ms / (24 * 60 * 60 * 1000);
  if (days >= 1) return `${days.toFixed(1)} d`;
  const hours = ms / (60 * 60 * 1000);
  return `${hours.toFixed(1)} h`;
}

function formatPercent(share: number | null): string {
  return share === null ? "—" : `${(share * 100).toFixed(0)}%`;
}

function formatAverage(value: number | null, digits = 2): string {
  return value === null ? "—" : value.toFixed(digits);
}

type StageTotal = {
  stageId: StageId;
  visitCount: number;
  totalMs: number;
  reReview: { visitCount: number; totalMs: number };
};

/** One entry per relay stage (#93) - the two occurrence buckets
 *  `computeMeasures` keeps separate (first-pass, re-review) folded into a
 *  single bar's length and visit count, since the chart's story is "where
 *  does time go by stage," not first-pass-versus-re-review. Re-review time
 *  is not lost in the fold: whenever a stage has any, it still gets its own
 *  visible line beneath the bar (BDR-0006: "the days it costs stay attached
 *  to the stage that found it"), the same fact the old table's separate row
 *  reported. */
function stageTotals(rows: StageOccurrenceMeasure[]): StageTotal[] {
  return RELAY_CONFIG.map((stage) => {
    const forStage = rows.filter((row) => row.stageId === stage.id);
    const reReview = forStage.find((row) => row.occurrence === "re-review");
    return {
      stageId: stage.id,
      visitCount: forStage.reduce((sum, row) => sum + row.visitCount, 0),
      totalMs: forStage.reduce((sum, row) => sum + row.approverMs + row.awaitingCorrectionMs, 0),
      reReview: {
        visitCount: reReview?.visitCount ?? 0,
        totalMs: (reReview?.approverMs ?? 0) + (reReview?.awaitingCorrectionMs ?? 0),
      },
    };
  });
}

/** A stage's `totalMs` is a sum across every completed visit in the seeded
 *  or live history, not one authorization's own time there
 *  (`computeMeasures`'s documented contract, `measures/index.ts`: "total
 *  elapsed time"). Rendering that sum as if it were a single typical
 *  duration is what made the tile misread as "this stage alone takes over
 *  a week" and made the eight tiles look like they summed to a whole
 *  authorization's journey, rather than to the history behind several -
 *  dividing by `visitCount` is what turns it back into "how long does this
 *  stage typically take." `null`, not a fallback to the raw total, when
 *  `visitCount` is 0 - the same convention M2's own `averageMs` already
 *  uses for "nothing to average yet" (`Measures.m2CycleTime`) - since a
 *  total attached to zero *resolved* visits (a still-open visit that has
 *  already accrued closed awaiting-correction time, `stageTotals`'s own
 *  comment below) isn't an average of anything and saying so would be
 *  self-contradicting. */
function perVisitMs(totalMs: number, visitCount: number): number | null {
  return visitCount > 0 ? totalMs / visitCount : null;
}

/** Five fixed levels, not a continuous scale - `--seq-0..4` in `styles.css`
 *  are the only hexes this ever renders (the dataviz skill's "documented
 *  palette only" rule), so magnitude is quantized into whichever of those
 *  five tiles is closest rather than an interpolated color no CSS variable
 *  actually holds. Five, not eight or ten: `validate_palette.js --ordinal`
 *  only passes at this spacing (see `styles.css`'s own comment on
 *  `--seq-0..4`). Which ink a level reads with is decided in CSS, not
 *  here - it depends on that level's actual hex in the current mode, and
 *  light/dark don't agree at every level (`styles.css`'s own comment on
 *  `.stage-chart-cell`). */
const STAGE_CHART_LEVELS = 5;

function stageChartLevel(totalMs: number, maxMs: number): number {
  if (maxMs <= 0) return 0;
  return Math.min(STAGE_CHART_LEVELS - 1, Math.round((totalMs / maxMs) * (STAGE_CHART_LEVELS - 1)));
}

function StageChartRow({ total, maxMs }: { total: StageTotal; maxMs: number }) {
  // Gated on `totalMs` as well as `visitCount`, not `visitCount` alone: a
  // visit that is itself still open can already carry closed
  // awaiting-correction time (`computeMeasures`'s own documented case, "even
  // when that stage's own visit never resolves"), which counts toward the
  // tile's level without ever incrementing `visitCount`. Gating the text on
  // `visitCount` alone would render a colored tile next to "No visits yet" -
  // exactly the mismatch the old table's separate, independently-gated
  // columns avoided.
  const hasAnyTime = total.visitCount > 0 || total.totalMs > 0;
  const hasReReviewTime = total.reReview.visitCount > 0 || total.reReview.totalMs > 0;
  const averageMs = perVisitMs(total.totalMs, total.visitCount);
  // The rare edge case (`perVisitMs`'s own comment) still needs some value
  // to pick a tile color - the raw total is the only one available, and a
  // pre-resolution total is closer to the eventual per-visit figure than
  // treating it as zero would be.
  const level = stageChartLevel(averageMs ?? total.totalMs, maxMs);
  const reReviewAverageMs = perVisitMs(total.reReview.totalMs, total.reReview.visitCount);
  return (
    <li className="stage-chart-row" data-testid="insights-stage-chart-row" data-stage-id={total.stageId}>
      <span className="stage-chart-label">{STAGE_LABELS[total.stageId]}</span>
      <span className="stage-chart-cell" data-level={level}>
        <span className="stage-chart-value" data-testid="insights-stage-chart-value">
          {hasAnyTime ? formatDuration(averageMs ?? total.totalMs) : "—"}
        </span>
        <span className="stage-chart-meta">
          {averageMs !== null
            ? `avg. of ${total.visitCount} visit${total.visitCount === 1 ? "" : "s"}`
            : hasAnyTime
              ? "no resolved visits yet"
              : "No visits yet"}
        </span>
      </span>
      {hasReReviewTime && (
        <span className="stage-chart-detail" data-testid="insights-stage-chart-re-review">
          {reReviewAverageMs !== null ? (
            <>
              Includes {OCCURRENCE_LABELS["re-review"].toLowerCase()}: avg. {formatDuration(reReviewAverageMs)}{" "}
              across {total.reReview.visitCount} visit{total.reReview.visitCount === 1 ? "" : "s"}
            </>
          ) : (
            <>
              Includes {OCCURRENCE_LABELS["re-review"].toLowerCase()}: {formatDuration(total.reReview.totalMs)}{" "}
              (no resolved visits yet)
            </>
          )}
        </span>
      )}
    </li>
  );
}

export function InsightsDashboard({ actingId }: InsightsDashboardProps) {
  const [measures, setMeasures] = useState<Measures | null>(null);
  const [error, setError] = useState<string | null>(null);

  const latest = useRef(0);

  const load = useCallback(async (actor: string) => {
    const seq = ++latest.current;
    try {
      const found = await api.getMeasures(actor);
      if (seq === latest.current) setMeasures(found);
    } catch (err) {
      if (seq === latest.current) setError(err instanceof ApiError ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void load(actingId);
  }, [load, actingId]);

  // Polls in the background, the same pattern `MyQueue.tsx`'s arrival
  // notifications and `RevocationNotices.tsx` already use - without it,
  // this tab only ever refetches when `actingId` changes, so a measure this
  // same participant's own further clicking moves (or a demo Reset
  // reseeding the store entirely, #94 follow-up) never appears here until
  // something incidentally changes who is acting. The scripted demo's own
  // closing narration - "Insights updates live" - depends on this.
  useEffect(() => {
    const interval = setInterval(() => void load(actingId), INSIGHTS_POLL_MS);
    return () => clearInterval(interval);
  }, [load, actingId]);

  const stageChartRows = measures === null ? [] : stageTotals(measures.stageOccurrences);
  const maxStageMs = Math.max(
    0,
    ...stageChartRows.map((total) => perVisitMs(total.totalMs, total.visitCount) ?? total.totalMs),
  );

  return (
    <section aria-labelledby="insights-heading" data-testid="insights-dashboard">
      <h2 id="insights-heading">Insights dashboard</h2>
      <p className="hint">
        Every figure below is a fold over the same transition log the rest of this product writes,
        run over seeded history so a days-long story fits inside a few minutes of clicking. Intended
        for an Administrator - not enforced here, since every participant is mocked. Referrals are
        never counted (BDR-0011), and nothing attributes time or defects to a named person.
      </p>

      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}

      {measures === null ? (
        <p className="hint">Loading…</p>
      ) : (
        <>
          <div className="stat-tiles" data-testid="insights-headline-measures">
            <div className="stat-tile" data-testid="insights-m1-tile">
              <span className="stat-tile-label">M1 — completed with zero correction requests</span>
              <span className="stat-tile-value" data-testid="insights-m1">
                {formatPercent(measures.m1ZeroCorrectionShare.share)}
              </span>
              <span className="stat-tile-detail">
                <span data-testid="insights-m1-zero-correction-count">
                  {measures.m1ZeroCorrectionShare.zeroCorrectionCount}
                </span>{" "}
                of{" "}
                <span data-testid="insights-m1-completed-count">
                  {measures.m1ZeroCorrectionShare.completedCount}
                </span>{" "}
                completed
              </span>
            </div>

            <div className="stat-tile" data-testid="insights-m2-tile">
              <span className="stat-tile-label">M2 — average cycle time (held time excluded)</span>
              <span className="stat-tile-value" data-testid="insights-m2">
                {measures.m2CycleTime.averageMs === null ? "—" : formatDuration(measures.m2CycleTime.averageMs)}
              </span>
              <span className="stat-tile-detail">
                n=<span data-testid="insights-m2-completed-count">{measures.m2CycleTime.completedCount}</span>
              </span>
            </div>

            <div className="stat-tile" data-testid="insights-m3-tile">
              <span className="stat-tile-label">M3 — correction requests per authorization</span>
              <span className="stat-tile-value" data-testid="insights-m3">
                {formatAverage(measures.m3CorrectionsPerAuthorization.average)}
              </span>
              <span className="stat-tile-detail">
                <span data-testid="insights-m3-total-correction-requests">
                  {measures.m3CorrectionsPerAuthorization.totalCorrectionRequests}
                </span>{" "}
                across{" "}
                <span data-testid="insights-m3-authorization-count">
                  {measures.m3CorrectionsPerAuthorization.authorizationCount}
                </span>{" "}
                authorizations
              </span>
            </div>
          </div>

          <p className="hint" data-testid="insights-held-time">
            Held time — reported separately, excluded from every measure above:{" "}
            {formatDuration(measures.heldTime.totalMs)} total, across{" "}
            <span data-testid="insights-held-authorization-count">{measures.heldTime.authorizationCount}</span> held
            authorization{measures.heldTime.authorizationCount === 1 ? "" : "s"}.
          </p>

          <h3>Time in each stage</h3>
          <p className="hint">
            One tile per relay stage, in the relay's own sequence rather than sorted by value, so
            the chart reads as where time goes in the process (#93, ADR-0006) - each tile is that
            stage's average time per visit, not a total across every visit behind it, so the tiles
            read as one typical authorization's journey rather than the whole history's accumulated
            hours. Darker means more time, on a fixed five-step scale. First-pass and re-review time
            are folded into one tile per stage; a stage with any re-review time still gets a visible
            line for it, so nobody is charged for the rules or the data moving beneath them (#60,
            BDR-0006). Held time is excluded throughout.
          </p>
          <ul className="stage-chart" data-testid="insights-stage-chart">
            {stageChartRows.map((total) => (
              <StageChartRow key={total.stageId} total={total} maxMs={maxStageMs} />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
