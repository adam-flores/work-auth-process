import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "./api.ts";
import type { Authorization, Draft } from "./api.ts";
import type { Participant } from "../shared/rules.ts";
import { isTerminal } from "../shared/rules.ts";
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
  { value: "revoked", label: "Revoked" },
];

/** The stage label a row is filtered and displayed by - not a stored
 *  column (ADR-0008), folded the same way `Authorization.currentStageId`
 *  itself is: completion and withdrawal are read off `chargeNumber` and
 *  `withdrawnAt` existing, never a separate status. */
function stageOf(authorization: Authorization): string {
  if (authorization.chargeNumber !== null) return "completed";
  if (authorization.withdrawnAt !== null) return "withdrawn";
  if (authorization.revokedAt !== null) return "revoked";
  return authorization.currentStageId;
}

function stageLabel(stageValue: string): string {
  if (stageValue === "draft") return "Draft";
  if (stageValue === "completed") return "Completed";
  if (stageValue === "withdrawn") return "Withdrawn";
  if (stageValue === "revoked") return "Revoked";
  return STAGE_LABELS[stageValue as StageId] ?? stageValue;
}

/** Color follows the two states that are actually good or bad news -
 *  completed and revoked; draft, withdrawn, and every in-progress relay
 *  stage stay the plain neutral badge, since none of those are a status to
 *  react to. */
function stageBadgeClass(stageValue: string): string {
  if (stageValue === "completed") return "badge badge-good";
  if (stageValue === "revoked") return "badge badge-critical";
  return "badge";
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
/** The submitter's own controls over their authorization (#61, CONTEXT.md:
 *  "On hold" / "Withdrawn"): hold, release a hold, and withdraw outright.
 *  Shown only to the submitter, and only while the authorization is not
 *  already terminal - the same two conditions the service checks
 *  (`requireSubmitter`, `requireNotTerminal`), enforced here too so a
 *  disabled control never invites a request the service would refuse.
 *  There is no dedicated "my authorizations" view yet (`MyDrafts.tsx` is
 *  drafts only), so this is the submitter's view of their own authorization
 *  today: the master dashboard, open to anyone, with these three controls
 *  appearing only when the person looking is the one who raised it. */
function SubmitterControls({
  actingId,
  authorization,
  onUpdated,
}: {
  actingId: string;
  authorization: Authorization;
  onUpdated: (authorization: Authorization) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (authorization.submitterId !== actingId || isTerminal(authorization)) return null;

  const run = async (action: (actor: string, id: string) => Promise<Authorization>) => {
    setBusy(true);
    setError(null);
    try {
      onUpdated(await action(actingId, authorization.id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="submitter-controls" data-testid="submitter-controls">
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {authorization.onHold ? (
        <button type="button" onClick={() => void run(api.release)} disabled={busy} data-testid="release">
          {busy ? "Releasing…" : "Release"}
        </button>
      ) : (
        <button type="button" onClick={() => void run(api.hold)} disabled={busy} data-testid="hold">
          {busy ? "Holding…" : "Hold"}
        </button>
      )}
      <button type="button" onClick={() => void run(api.withdraw)} disabled={busy} data-testid="withdraw">
        {busy ? "Withdrawing…" : "Withdraw"}
      </button>
    </div>
  );
}

function AuthorizationHistory({
  actingId,
  authorization,
  participantName,
  onUpdated,
}: {
  actingId: string;
  authorization: Authorization;
  participantName: (id: string) => string;
  onUpdated: (authorization: Authorization) => void;
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
        {authorization.revokedAt && (
          <dd data-testid="dashboard-revocation">
            Revoked on {new Date(authorization.revokedAt).toLocaleString()}: {authorization.revocationComment}
          </dd>
        )}
      </dl>

      <SubmitterControls actingId={actingId} authorization={authorization} onUpdated={onUpdated} />

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

  // Patched in from what the action itself returned, the same discipline
  // `MyQueue.tsx`'s `onClaimed` already follows - a reload is async and
  // would race the click handler's own `busy` reset.
  const onAuthorizationUpdated = (updated: Authorization) => {
    setAuthorizations((prev) => prev?.map((a) => (a.id === updated.id ? updated : a)) ?? prev);
  };

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

      <ul className="card-list dashboard-cards" data-testid="dashboard-rows">
        {authorizations === null || drafts === null ? (
          <li className="hint">Loading…</li>
        ) : filteredRows.length === 0 ? (
          <li className="hint">No matching authorizations or drafts.</li>
        ) : (
          filteredRows.map((row) => (
            <li key={row.id} className="card dashboard-card" data-testid="dashboard-row">
              <div className="card-header">
                <span className="card-title" data-testid="dashboard-row-project">
                  {row.project}
                </span>
                {row.kind === "authorization" && (
                  <button type="button" onClick={() => setOpenId(row.id)} data-testid="dashboard-view-history">
                    View history
                  </button>
                )}
              </div>
              <div className="card-badges">
                <span className={stageBadgeClass(row.stage)} data-testid="dashboard-row-stage">
                  {stageLabel(row.stage)}
                </span>
                <span className="card-meta" data-testid="dashboard-row-submitter">
                  {participantName(row.submitterId)}
                </span>
              </div>
              <span className="card-identifier" data-testid="dashboard-row-identifier">
                {row.id}
              </span>
            </li>
          ))
        )}
      </ul>

      {openAuthorization && (
        <div data-testid="dashboard-detail">
          <h3>{openAuthorization.project}</h3>
          <AuthorizationHistory
            key={openAuthorization.id}
            actingId={actingId}
            authorization={openAuthorization}
            participantName={participantName}
            onUpdated={onAuthorizationUpdated}
          />
          <button type="button" onClick={() => setOpenId(null)}>
            Close
          </button>
        </div>
      )}
    </section>
  );
}
