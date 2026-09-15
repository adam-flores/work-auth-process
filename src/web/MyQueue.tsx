import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "./api.ts";
import type { Authorization, ResolvedDepartment } from "./api.ts";
import { FUNDING_TYPE_LABELS, LOCATION_TYPE_LABELS } from "../shared/constants.ts";
import { STAGE_CRITERIA } from "../guidance/content.ts";

/**
 * An Approver's queue (#55, BDR-0002): what has arrived at this participant's
 * role and department, derived from the log rather than a list anyone
 * maintains. Opening an item shows the whole authorization - no stage sees
 * less of one than any other (BDR-0007) - and acknowledging it is the one
 * action this surface offers; there is no denial or rejection here
 * (CONTEXT.md: "no approver refuses on the merits").
 */

export type MyQueueProps = { actingId: string };

/** The requesting and performing department, resolved to names for display -
 *  an authorization carries only their ids. */
function useResolvedDepartments(
  actingId: string,
  authorization: Authorization,
): { requesting: ResolvedDepartment | null; performing: ResolvedDepartment | null } {
  const [requesting, setRequesting] = useState<ResolvedDepartment | null>(null);
  const [performing, setPerforming] = useState<ResolvedDepartment | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRequesting(null);
    setPerforming(null);
    void api.getDepartment(actingId, authorization.requestingDepartmentId).then((d) => {
      if (!cancelled) setRequesting(d);
    });
    void api.getDepartment(actingId, authorization.performingDepartmentId).then((d) => {
      if (!cancelled) setPerforming(d);
    });
    return () => {
      cancelled = true;
    };
  }, [actingId, authorization.id, authorization.requestingDepartmentId, authorization.performingDepartmentId]);

  return { requesting, performing };
}

function OpenAuthorization({
  actingId,
  authorization,
  onAcknowledged,
  onClose,
}: {
  actingId: string;
  authorization: Authorization;
  onAcknowledged: (authorization: Authorization) => void;
  onClose: () => void;
}) {
  const { requesting, performing } = useResolvedDepartments(actingId, authorization);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const stage = STAGE_CRITERIA[authorization.currentStageId];

  const acknowledge = async () => {
    setBusy(true);
    setError(null);
    try {
      const updated = await api.acknowledge(actingId, authorization.id);
      onAcknowledged(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
      setBusy(false);
    }
  };

  return (
    <div className="queue-item-detail" data-testid="queue-item-detail">
      <h3>{authorization.project}</h3>

      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}

      <dl>
        <dt>Requesting department</dt>
        <dd>{requesting?.name ?? "…"}</dd>
        <dt>Performing department</dt>
        <dd>{performing?.name ?? "…"}</dd>
        <dt>Funding type</dt>
        <dd>{FUNDING_TYPE_LABELS[authorization.fundingType]}</dd>
        <dt>Requesting location type</dt>
        <dd>{LOCATION_TYPE_LABELS[authorization.requestingLocationType]}</dd>
        <dt>Performing location type</dt>
        <dd>{LOCATION_TYPE_LABELS[authorization.performingLocationType]}</dd>
        <dt>Requesting program manager</dt>
        <dd>{authorization.requestingProgramManager}</dd>
        <dt>Requesting finance approver</dt>
        <dd>{authorization.requestingFinanceApprover}</dd>
        <dt>Performing program manager</dt>
        <dd>{authorization.performingProgramManager}</dd>
        <dt>Performing finance approver</dt>
        <dd>{authorization.performingFinanceApprover}</dd>
      </dl>

      <ul data-testid="queue-item-resources">
        {authorization.resources.map((resource) => (
          <li key={resource.id}>
            {resource.budgetHours} hrs @ ${resource.laborRate}/hr
          </li>
        ))}
      </ul>

      <section aria-labelledby="queue-item-stage-heading" data-testid="queue-item-stage">
        <h4 id="queue-item-stage-heading">This stage's criteria</h4>
        <p>
          <strong>{stage.concern}:</strong> {stage.criteria}
        </p>
      </section>

      <div className="queue-item-actions">
        <button type="button" onClick={() => void acknowledge()} disabled={busy} data-testid="acknowledge">
          {busy ? "Acknowledging…" : "Acknowledge"}
        </button>
        <button type="button" onClick={onClose} disabled={busy}>
          Close
        </button>
      </div>
    </div>
  );
}

export function MyQueue({ actingId }: MyQueueProps) {
  const [items, setItems] = useState<Authorization[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const latest = useRef(0);

  const load = useCallback(async (actor: string) => {
    const seq = ++latest.current;
    try {
      const mine = await api.listMyQueue(actor);
      if (seq === latest.current) setItems(mine);
    } catch (err) {
      if (seq === latest.current) {
        setError(err instanceof ApiError ? err.message : String(err));
      }
    }
  }, []);

  useEffect(() => {
    setOpenId(null);
    void load(actingId);
  }, [load, actingId]);

  // Reloaded rather than filtered out locally: the next stage can route to
  // this same department (both requesting-side stages do), in which case
  // the authorization never actually left this participant's queue - it is
  // simply awaiting a different stage now. Only a genuine re-fetch can tell
  // the two cases apart.
  const onAcknowledged = () => {
    setOpenId(null);
    void load(actingId);
  };

  const open = items?.find((a) => a.id === openId) ?? null;

  return (
    <section aria-labelledby="queue-heading" data-testid="my-queue">
      <h2 id="queue-heading">My queue</h2>
      <p className="hint">
        What has arrived at your role and department, derived from the log - not a list anyone
        maintains. Every holder of the role sees the same queue, and any of them may acknowledge
        (BDR-0013).
      </p>

      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}

      <ul className="queue-list" data-testid="queue-list">
        {items === null ? (
          <li className="hint">Loading…</li>
        ) : items.length === 0 ? (
          <li className="hint">Nothing is waiting on you.</li>
        ) : (
          items.map((authorization) => (
            <li key={authorization.id} data-testid="queue-row">
              <span>{authorization.project}</span>
              <button type="button" onClick={() => setOpenId(authorization.id)}>
                Open
              </button>
            </li>
          ))
        )}
      </ul>

      {open && (
        <OpenAuthorization
          actingId={actingId}
          authorization={open}
          onAcknowledged={onAcknowledged}
          onClose={() => setOpenId(null)}
        />
      )}
    </section>
  );
}
