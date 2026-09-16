import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "./api.ts";
import type { Attribute, Authorization, ResolvedDepartment } from "./api.ts";
import { FUNDING_TYPE_LABELS, LOCATION_TYPE_LABELS } from "../shared/constants.ts";
import { STAGE_CRITERIA } from "../guidance/content.ts";
import { RELAY_CONFIG, isContributionStage } from "../relay/config.ts";

/**
 * A queue (#55, #56, #57, BDR-0002): what has arrived at this participant's
 * role and department, derived from the log rather than a list anyone
 * maintains. Opening an item shows the whole authorization and every
 * attribute of both departments - no stage sees less of one than any other
 * (BDR-0007), which is also what Global Trade's gate needs: every field and
 * every department attribute, with the product deriving no export
 * determination of its own (BDR-0014). An Approver acknowledges - a gate
 * that runs is acknowledged exactly like one of the four mandatory
 * approvals; there is no denial or rejection here (CONTEXT.md: "no approver
 * refuses on the merits"). A Contributor claims an unclaimed item and then
 * completes it by naming the employee who will perform the work
 * (CONTEXT.md: "Claim").
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

/** Every attribute a resolved department carries, its own plus everything
 *  held above it (`ResolvedDepartment.attributes`) - shown for both sides on
 *  every stage, not only Global Trade's. BDR-0007 draws no line between
 *  stages on what an authorization's own fields show, and a department's
 *  attributes are read the same way: the product hands over what it holds,
 *  and derives no export determination of its own (BDR-0014). */
function DepartmentAttributes({ label, department }: { label: string; department: ResolvedDepartment | null }) {
  if (!department) return null;
  return (
    <div className="department-attributes" data-testid={`${label.toLowerCase().replace(/\s+/g, "-")}-attributes`}>
      <h4>{label} attributes</h4>
      {department.attributes.length === 0 ? (
        <p className="hint">No attributes recorded.</p>
      ) : (
        <ul>
          {department.attributes.map((attribute: Attribute) => (
            <li key={`${attribute.name}=${attribute.value}`}>
              {attribute.name}: {attribute.value}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function OpenAuthorization({
  actingId,
  authorization,
  onResolved,
  onClaimed,
  onClose,
}: {
  actingId: string;
  authorization: Authorization;
  onResolved: (authorization: Authorization) => void;
  onClaimed: (authorization: Authorization) => void;
  onClose: () => void;
}) {
  const { requesting, performing } = useResolvedDepartments(actingId, authorization);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [employeeName, setEmployeeName] = useState("");
  const criteria = STAGE_CRITERIA[authorization.currentStageId];
  const relayStage = RELAY_CONFIG.find((s) => s.id === authorization.currentStageId)!;
  const isContribution = isContributionStage(relayStage);
  const isClaimant = authorization.performingContributorId === actingId;

  const acknowledge = async () => {
    setBusy(true);
    setError(null);
    try {
      const updated = await api.acknowledge(actingId, authorization.id);
      onResolved(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
      setBusy(false);
    }
  };

  const claim = async () => {
    setBusy(true);
    setError(null);
    try {
      const updated = await api.claim(actingId, authorization.id);
      onClaimed(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const contribute = async () => {
    setBusy(true);
    setError(null);
    try {
      const updated = await api.contribute(actingId, authorization.id, { performingEmployee: employeeName });
      onResolved(updated);
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
        {(isContribution || authorization.performingContributorId !== null) && (
          <>
            <dt>Claim status</dt>
            <dd data-testid="claim-status">
              {authorization.performingContributorId === null ? "Unclaimed" : "Claimed"}
            </dd>
          </>
        )}
        {authorization.performingEmployee !== null && (
          <>
            <dt>Employee performing the work</dt>
            <dd>{authorization.performingEmployee}</dd>
          </>
        )}
      </dl>

      <ul data-testid="queue-item-resources">
        {authorization.resources.map((resource) => (
          <li key={resource.id}>
            {resource.budgetHours} hrs @ ${resource.laborRate}/hr
          </li>
        ))}
      </ul>

      <DepartmentAttributes label="Requesting department" department={requesting} />
      <DepartmentAttributes label="Performing department" department={performing} />

      <section aria-labelledby="queue-item-stage-heading" data-testid="queue-item-stage">
        <h4 id="queue-item-stage-heading">This stage's criteria</h4>
        <p>
          <strong>{criteria.concern}:</strong> {criteria.criteria}
        </p>
      </section>

      <div className="queue-item-actions">
        {isContribution ? (
          authorization.performingContributorId === null ? (
            <button type="button" onClick={() => void claim()} disabled={busy} data-testid="claim">
              {busy ? "Claiming…" : "Claim"}
            </button>
          ) : isClaimant ? (
            <>
              <label htmlFor="performing-employee">Employee performing the work</label>
              <input
                id="performing-employee"
                type="text"
                value={employeeName}
                onChange={(e) => setEmployeeName(e.target.value)}
                disabled={busy}
              />
              <button
                type="button"
                onClick={() => void contribute()}
                disabled={busy || employeeName.trim().length === 0}
                data-testid="contribute"
              >
                {busy ? "Completing…" : "Complete"}
              </button>
            </>
          ) : (
            <p className="hint" data-testid="claimed-by-other">
              Claimed. Only the contributor who claimed it may fill in the rest.
            </p>
          )
        ) : (
          <button type="button" onClick={() => void acknowledge()} disabled={busy} data-testid="acknowledge">
            {busy ? "Acknowledging…" : "Acknowledge"}
          </button>
        )}
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
  // the two cases apart. Used after both an acknowledgement and a
  // contribution - either one resolves the current stage.
  const onResolved = () => {
    setOpenId(null);
    void load(actingId);
  };

  // A claim does not resolve anything - it only names the contributor - so
  // the item stays exactly where it is, still open, now showing as claimed
  // (#56). Patched in from what `claim` already returned rather than
  // reloaded: a reload is async and would race the click handler's own
  // `busy` reset, re-enabling the Claim button before the refreshed data
  // lands and inviting a second, redundant claim attempt.
  const onClaimed = (updated: Authorization) => {
    setItems((prev) => prev?.map((a) => (a.id === updated.id ? updated : a)) ?? prev);
  };

  const open = items?.find((a) => a.id === openId) ?? null;

  return (
    <section aria-labelledby="queue-heading" data-testid="my-queue">
      <h2 id="queue-heading">My queue</h2>
      <p className="hint">
        What has arrived at your role and department, derived from the log - not a list anyone
        maintains. Every holder of the role sees the same queue, and any of them may act on it
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
          items.map((authorization) => {
            const relayStage = RELAY_CONFIG.find((s) => s.id === authorization.currentStageId)!;
            return (
              <li key={authorization.id} data-testid="queue-row">
                <span>{authorization.project}</span>
                {isContributionStage(relayStage) && (
                  <span data-testid="claim-status">
                    {authorization.performingContributorId === null ? "Unclaimed" : "Claimed"}
                  </span>
                )}
                <button type="button" onClick={() => setOpenId(authorization.id)}>
                  Open
                </button>
              </li>
            );
          })
        )}
      </ul>

      {open && (
        <OpenAuthorization
          actingId={actingId}
          authorization={open}
          onResolved={onResolved}
          onClaimed={onClaimed}
          onClose={() => setOpenId(null)}
        />
      )}
    </section>
  );
}
