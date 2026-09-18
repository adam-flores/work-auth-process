import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "./api.ts";
import type { Measures, Occurrence, StageOccurrenceMeasure } from "./api.ts";
import type { StageId } from "../guidance/content.ts";

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
 */

export type InsightsDashboardProps = { actingId: string };

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

function StageRow({ row }: { row: StageOccurrenceMeasure }) {
  return (
    <tr data-testid="insights-stage-row">
      <td>{STAGE_LABELS[row.stageId]}</td>
      <td>{OCCURRENCE_LABELS[row.occurrence]}</td>
      <td>{row.visitCount}</td>
      <td>{row.visitCount > 0 ? formatDuration(row.approverMs) : "—"}</td>
      {/* Awaiting-correction time is credited to whichever visit was open
          when the round was raised, even one that itself never resolves
          and so never adds to `visitCount` (`computeMeasures`'s own
          comment on this) - gating this column on `visitCount` would hide
          exactly that time. */}
      <td>{row.awaitingCorrectionMs > 0 ? formatDuration(row.awaitingCorrectionMs) : "—"}</td>
    </tr>
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
          <dl data-testid="insights-headline-measures">
            <dt>M1 - completed with zero correction requests</dt>
            <dd data-testid="insights-m1">
              {formatPercent(measures.m1ZeroCorrectionShare.share)} (
              <span data-testid="insights-m1-zero-correction-count">
                {measures.m1ZeroCorrectionShare.zeroCorrectionCount}
              </span>{" "}
              of{" "}
              <span data-testid="insights-m1-completed-count">{measures.m1ZeroCorrectionShare.completedCount}</span>{" "}
              completed)
            </dd>

            <dt>M2 - average cycle time, initiation to completion (held time excluded)</dt>
            <dd data-testid="insights-m2">
              {measures.m2CycleTime.averageMs === null ? "—" : formatDuration(measures.m2CycleTime.averageMs)} (n=
              <span data-testid="insights-m2-completed-count">{measures.m2CycleTime.completedCount}</span>)
            </dd>

            <dt>M3 - correction requests per authorization</dt>
            <dd data-testid="insights-m3">
              {formatAverage(measures.m3CorrectionsPerAuthorization.average)} (
              <span data-testid="insights-m3-total-correction-requests">
                {measures.m3CorrectionsPerAuthorization.totalCorrectionRequests}
              </span>{" "}
              across{" "}
              <span data-testid="insights-m3-authorization-count">
                {measures.m3CorrectionsPerAuthorization.authorizationCount}
              </span>{" "}
              authorizations)
            </dd>

            <dt>Held time - reported separately, excluded from every measure above</dt>
            <dd data-testid="insights-held-time">
              {formatDuration(measures.heldTime.totalMs)} total, across{" "}
              <span data-testid="insights-held-authorization-count">{measures.heldTime.authorizationCount}</span>{" "}
              held authorization{measures.heldTime.authorizationCount === 1 ? "" : "s"}
            </dd>
          </dl>

          <h3>Time in each stage</h3>
          <p className="hint">
            First-pass time is a stage's own clock; a re-entered stage is reported as its own line
            rather than folded into first-pass, so nobody is charged for the rules or the data
            moving beneath them (#60, BDR-0006). Held time is excluded from both columns below.
          </p>
          <table data-testid="insights-stage-table">
            <thead>
              <tr>
                <th scope="col">Stage</th>
                <th scope="col">Occurrence</th>
                <th scope="col">Visits</th>
                <th scope="col">Approver time</th>
                <th scope="col">Awaiting correction</th>
              </tr>
            </thead>
            <tbody>
              {measures.stageOccurrences.map((row) => (
                <StageRow key={`${row.stageId}-${row.occurrence}`} row={row} />
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
