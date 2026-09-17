import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "./api.ts";
import type { Authorization, Draft } from "./api.ts";
import type { Participant } from "../shared/rules.ts";
import type { StageId } from "../guidance/content.ts";
import { RELAY_CONFIG } from "../relay/config.ts";
import { useResolvedDepartments } from "./useResolvedDepartments.ts";

/**
 * The master dashboard (#63, BDR-0002, CONTEXT.md: "Master dashboard"):
 * every authorization in the system, open to anyone with access and
 * filterable by submitter, stage, participant or identifier - the opposite
 * of a queue, which is scoped to one participant's role and drops an
 * authorization the moment it resolves. A draft appears here too
 * (BDR-0003: "on the master dashboard like anything else"), since it has
 * not yet reached anybody's queue at all. Filtering happens client-side
 * over the one unfiltered read `api.listDashboard` returns (ADR-0008: "the
 * master dashboard cannot filter by stage in SQL either" - nothing here is
 * a stored column).
 */

export type MasterDashboardProps = { actingId: string };

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

/** Every stage a filter or a row may show, in relay order plus the three
 *  states no relay stage names: not yet initiated, and the two terminal
 *  outcomes (`#63`'s acceptance criterion that a draft is "visible ... like
 *  anything else", and that a completed or withdrawn authorization stays
 *  readable here rather than dropping out of view the way it drops out of
 *  a queue). */
const STAGE_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: "draft", label: "Draft" },
  ...RELAY_CONFIG.map((stage) => ({ value: stage.id, label: STAGE_LABELS[stage.id] })),
  { value: "completed", label: "Completed" },
  { value: "withdrawn", label: "Withdrawn" },
];

/** The stage label a row is filtered and displayed by - not a stored
 *  column (ADR-0008), folded the same way `Authorization.currentStageId`
 *  itself is: completion and withdrawal are read off `chargeNumber` and
 *  `withdrawnAt` existing, never a separate status. */
function stageOf(authorization: Authorization): string {
  if (authorization.chargeNumber !== null) return "completed";
  if (authorization.withdrawnAt !== null) return "withdrawn";
  return authorization.currentStageId;
}

function stageLabel(stageValue: string): string {
  if (stageValue === "draft") return "Draft";
  if (stageValue === "completed") return "Completed";
  if (stageValue === "withdrawn") return "Withdrawn";
  return STAGE_LABELS[stageValue as StageId] ?? stageValue;
}

/** Every field, on either a draft or an authorization, a free-text
 *  "participant" filter searches - most of these are strings a submitter
 *  typed rather than a participant id BDR-0002's visibility rules can
 *  resolve. `Authorization` types the named-approver fields as non-null
 *  `string` and `Draft` types the same fields as `string | null` (a draft
 *  is allowed to be incomplete); this widens to accept either so a single
 *  call site serves both without a synthesized, field-dropping stand-in. */
type SearchableParticipantFields = {
  submitterId: string;
  performingContributorId?: string | null;
  requestingProgramManager?: string | null;
  requestingFinanceApprover?: string | null;
  performingProgramManager?: string | null;
  performingFinanceApprover?: string | null;
  performingContact?: string | null;
  performingEmployee?: string | null;
};

/** The submitter and the performing contributor are the two fields above
 *  that are real participant ids, resolved to a name via `participantName`
 *  first; every other field is already the free text a submitter typed. */
function participantSearchText(
  record: SearchableParticipantFields,
  participantName: (id: string) => string,
): string {
  return [
    participantName(record.submitterId),
    record.performingContributorId ? participantName(record.performingContributorId) : null,
    record.requestingProgramManager,
    record.requestingFinanceApprover,
    record.performingProgramManager,
    record.performingFinanceApprover,
    record.performingContact,
    record.performingEmployee,
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLowerCase();
}

type DashboardRow =
  | { kind: "draft"; id: string; project: string; submitterId: string; stage: "draft"; draft: Draft }
  | {
      kind: "authorization";
      id: string;
      project: string;
      submitterId: string;
      stage: string;
      authorization: Authorization;
    };

/** An authorization's full transition history (#63, CONTEXT.md: "Master
 *  dashboard" - "where history is retrieved, since the queue keeps none").
 *  Every stage visit, hold span and referral the log has ever recorded for
 *  it - the same fields `Authorization` already carries, rendered rather
 *  than re-derived. */
function AuthorizationHistory({
  actingId,
  authorization,
  participantName,
}: {
  actingId: string;
  authorization: Authorization;
  participantName: (id: string) => string;
}) {
  const { requesting, performing } = useResolvedDepartments(actingId, authorization);

  return (
    <div className="dashboard-history" data-testid="dashboard-history">
      <dl>
        <dt>Submitter</dt>
        <dd>{participantName(authorization.submitterId)}</dd>
        <dt>Requesting department</dt>
        <dd>{requesting?.name ?? "…"}</dd>
        <dt>Performing department</dt>
        <dd>{performing?.name ?? "…"}</dd>
        <dt>Current stage</dt>
        <dd>{stageLabel(stageOf(authorization))}</dd>
        {authorization.onHold && <dd data-testid="dashboard-on-hold">On hold</dd>}
      </dl>

      <h4>Stage history</h4>
      <table data-testid="dashboard-stage-history">
        <thead>
          <tr>
            <th scope="col">Stage</th>
            <th scope="col">Arrived</th>
            <th scope="col">Notified</th>
            <th scope="col">Resolved</th>
          </tr>
        </thead>
        <tbody>
          {authorization.stageHistory.map((visit, index) => (
            <tr key={`${visit.stageId}-${index}`}>
              <td>
                {STAGE_LABELS[visit.stageId]}
                {visit.reReviewCause && (
                  <span className="hint">
                    {" "}
                    (re-review:{" "}
                    {visit.reReviewCause === "configuration-change" ? "configuration changed" : "correction"})
                  </span>
                )}
              </td>
              <td>{new Date(visit.arrivedAt).toLocaleString()}</td>
              <td>{new Date(visit.notifiedAt).toLocaleString()}</td>
              <td>{visit.resolvedAt ? new Date(visit.resolvedAt).toLocaleString() : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {authorization.holdIntervals.length > 0 && (
        <>
          <h4>Held</h4>
          <ul data-testid="dashboard-hold-intervals">
            {authorization.holdIntervals.map((interval, index) => (
              <li key={index}>
                {new Date(interval.heldAt).toLocaleString()} –{" "}
                {interval.releasedAt ? new Date(interval.releasedAt).toLocaleString() : "still held"}
              </li>
            ))}
          </ul>
        </>
      )}

      {authorization.referrals.length > 0 && (
        <>
          <h4>Referrals</h4>
          <ul data-testid="dashboard-referrals">
            {authorization.referrals.map((referral, index) => (
              <li key={index}>
                {participantName(referral.referredBy)} showed this to {participantName(referral.colleagueId)} on{" "}
                {new Date(referral.referredAt).toLocaleString()}
              </li>
            ))}
          </ul>
        </>
      )}

      {authorization.correctionRequest && (
        <>
          <h4>Outstanding correction</h4>
          <p data-testid="dashboard-correction-request">
            Requested by {participantName(authorization.correctionRequest.requestedBy)}:{" "}
            {authorization.correctionRequest.comment}
          </p>
        </>
      )}
    </div>
  );
}

export function MasterDashboard({ actingId }: MasterDashboardProps) {
  const [authorizations, setAuthorizations] = useState<Authorization[] | null>(null);
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const [identifierFilter, setIdentifierFilter] = useState("");
  const [submitterFilter, setSubmitterFilter] = useState("");
  const [participantFilter, setParticipantFilter] = useState("");
  const [stageFilter, setStageFilter] = useState("");

  const latest = useRef(0);

  const load = useCallback(async (actor: string) => {
    const seq = ++latest.current;
    try {
      const [dashboard, people] = await Promise.all([api.listDashboard(actor), api.listParticipants(actor)]);
      if (seq !== latest.current) return;
      setAuthorizations(dashboard.authorizations);
      setDrafts(dashboard.drafts);
      setParticipants(people);
    } catch (err) {
      if (seq === latest.current) setError(err instanceof ApiError ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    setOpenId(null);
    void load(actingId);
  }, [load, actingId]);

  const participantName = useCallback(
    (id: string) => participants.find((p) => p.id === id)?.name ?? id,
    [participants],
  );

  const rows: DashboardRow[] = [
    ...(drafts ?? []).map(
      (draft): DashboardRow => ({
        kind: "draft",
        id: draft.id,
        project: draft.project?.trim() || "Untitled draft",
        submitterId: draft.submitterId,
        stage: "draft",
        draft,
      }),
    ),
    ...(authorizations ?? []).map(
      (authorization): DashboardRow => ({
        kind: "authorization",
        id: authorization.id,
        project: authorization.project,
        submitterId: authorization.submitterId,
        stage: stageOf(authorization),
        authorization,
      }),
    ),
  ];

  const filteredRows = rows.filter((row) => {
    if (identifierFilter.trim() && !row.id.toLowerCase().includes(identifierFilter.trim().toLowerCase())) {
      return false;
    }
    if (stageFilter && row.stage !== stageFilter) return false;
    if (submitterFilter.trim()) {
      const needle = submitterFilter.trim().toLowerCase();
      const haystack = `${participantName(row.submitterId)} ${row.submitterId}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    if (participantFilter.trim()) {
      const needle = participantFilter.trim().toLowerCase();
      const haystack = participantSearchText(row.kind === "authorization" ? row.authorization : row.draft, participantName);
      if (!haystack.includes(needle)) return false;
    }
    return true;
  });

  const openAuthorization =
    openId !== null
      ? (authorizations ?? []).find((authorization) => authorization.id === openId) ?? null
      : null;

  return (
    <section aria-labelledby="dashboard-heading" data-testid="master-dashboard">
      <h2 id="dashboard-heading">Master dashboard</h2>
      <p className="hint">
        Every authorization in the system, open to anyone with access - including drafts, and
        including completed and withdrawn work a queue would already have dropped. Where an
        authorization's full transition history is retrieved, since the queue keeps none.
      </p>

      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}

      <div className="dashboard-filters" data-testid="dashboard-filters">
        <label htmlFor="dashboard-filter-identifier">Identifier</label>
        <input
          id="dashboard-filter-identifier"
          type="text"
          value={identifierFilter}
          onChange={(e) => setIdentifierFilter(e.target.value)}
          data-testid="dashboard-filter-identifier"
        />

        <label htmlFor="dashboard-filter-submitter">Submitter</label>
        <input
          id="dashboard-filter-submitter"
          type="text"
          value={submitterFilter}
          onChange={(e) => setSubmitterFilter(e.target.value)}
          data-testid="dashboard-filter-submitter"
        />

        <label htmlFor="dashboard-filter-participant">Participant name</label>
        <input
          id="dashboard-filter-participant"
          type="text"
          value={participantFilter}
          onChange={(e) => setParticipantFilter(e.target.value)}
          data-testid="dashboard-filter-participant"
        />

        <label htmlFor="dashboard-filter-stage">Stage</label>
        <select
          id="dashboard-filter-stage"
          value={stageFilter}
          onChange={(e) => setStageFilter(e.target.value)}
          data-testid="dashboard-filter-stage"
        >
          <option value="">All stages</option>
          {STAGE_FILTER_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <table className="dashboard-table">
        <thead>
          <tr>
            <th scope="col">Identifier</th>
            <th scope="col">Project</th>
            <th scope="col">Submitter</th>
            <th scope="col">Stage</th>
            <th scope="col" />
          </tr>
        </thead>
        <tbody data-testid="dashboard-rows">
          {authorizations === null || drafts === null ? (
            <tr>
              <td colSpan={5} className="hint">
                Loading…
              </td>
            </tr>
          ) : filteredRows.length === 0 ? (
            <tr>
              <td colSpan={5} className="hint">
                No matching authorizations or drafts.
              </td>
            </tr>
          ) : (
            filteredRows.map((row) => (
              <tr key={row.id} data-testid="dashboard-row">
                <td>{row.id}</td>
                <td>{row.project}</td>
                <td>{participantName(row.submitterId)}</td>
                <td>{stageLabel(row.stage)}</td>
                <td>
                  {row.kind === "authorization" && (
                    <button type="button" onClick={() => setOpenId(row.id)} data-testid="dashboard-view-history">
                      View history
                    </button>
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      {openAuthorization && (
        <div data-testid="dashboard-detail">
          <h3>{openAuthorization.project}</h3>
          <AuthorizationHistory
            key={openAuthorization.id}
            actingId={actingId}
            authorization={openAuthorization}
            participantName={participantName}
          />
          <button type="button" onClick={() => setOpenId(null)}>
            Close
          </button>
        </div>
      )}
    </section>
  );
}
