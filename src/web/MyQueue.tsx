import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api, ApiError } from "./api.ts";
import type { Attribute, Authorization, CorrectableFieldKey, ResolvedDepartment } from "./api.ts";
import { DepartmentPicker } from "./DepartmentPicker.tsx";
import { useResolvedDepartments } from "./useResolvedDepartments.ts";
import {
  FUNDING_TYPE_LABELS,
  FUNDING_TYPE_VALUES,
  LOCATION_TYPE_LABELS,
  LOCATION_TYPE_VALUES,
  SYSTEM_PARTICIPANT_ID,
} from "../shared/constants.ts";
import type { FundingType, LocationType } from "../shared/constants.ts";
import { STAGE_CRITERIA } from "../guidance/content.ts";
import { RELAY_CONFIG, isContributionStage, isMintStage } from "../relay/config.ts";
import { CORRECTABLE_FIELD_KEYS } from "../shared/rules.ts";
import type { Participant } from "../shared/rules.ts";

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

/** Plain-English labels for a correction's field checkboxes and its
 *  fulfillment form (#59) - short, unlike `FIELD_GUIDANCE`'s explanatory
 *  text, since a checkbox list needs a name, not an explanation. */
const FIELD_LABELS: Record<CorrectableFieldKey, string> = {
  project: "Project",
  requestingDepartmentId: "Requesting department",
  performingDepartmentId: "Performing department",
  fundingType: "Funding type",
  requestingLocationType: "Requesting location type",
  performingLocationType: "Performing location type",
  requestingProgramManager: "Requesting program manager",
  requestingFinanceApprover: "Requesting finance approver",
  performingProgramManager: "Performing program manager",
  performingFinanceApprover: "Performing finance approver",
  performingContact: "Performing-side contact",
  resources: "Resources",
  performingEmployee: "Employee performing the work",
};

/** Every field a correction request may name (#59), read off the same list
 *  the server validates a request against (`CORRECTABLE_FIELD_KEYS` in
 *  `shared/rules.ts`) rather than a second copy of it - `performingEmployee`
 *  is filtered back out until someone has claimed the authorization, since
 *  naming it before that leaves nobody to address the request to
 *  (`correctionOwner` in `authorizations/index.ts`). */
function nameableFields(authorization: Authorization): CorrectableFieldKey[] {
  return CORRECTABLE_FIELD_KEYS.filter(
    (field) => field !== "performingEmployee" || authorization.performingContributorId !== null,
  );
}

/** An Approver's way to raise a correction request (#59, BDR-0005): name
 *  the fields at fault, with a mandatory comment to their owner. Collapsed
 *  behind a toggle so it does not compete with "Acknowledge" for attention
 *  on every open item. */
function RequestCorrectionForm({
  actingId,
  authorization,
  onRequested,
}: {
  actingId: string;
  authorization: Authorization;
  onRequested: (authorization: Authorization) => void;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<CorrectableFieldKey>>(new Set());
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleField = (field: CorrectableFieldKey) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(field)) next.delete(field);
      else next.add(field);
      return next;
    });
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const updated = await api.requestCorrection(actingId, authorization.id, {
        fields: [...selected],
        comment,
      });
      onRequested(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} data-testid="open-request-correction">
        Report a problem
      </button>
    );
  }

  // The performing department can never be corrected (BDR-0012) - the
  // service refuses to name it alongside anything else, since that would
  // strand the other field behind a request nobody can ever satisfy.
  // Checked here too, so an approver learns this before typing a comment
  // rather than after submitting.
  const bundlesUncorrectableField = selected.has("performingDepartmentId") && selected.size > 1;

  return (
    <div className="request-correction-form" data-testid="request-correction-form">
      <h4>Request a correction</h4>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <fieldset>
        <legend>Fields at fault</legend>
        {nameableFields(authorization).map((field) => (
          <label key={field}>
            <input
              type="checkbox"
              checked={selected.has(field)}
              onChange={() => toggleField(field)}
              data-testid={`correction-field-${field}`}
            />
            {FIELD_LABELS[field]}
          </label>
        ))}
      </fieldset>
      {bundlesUncorrectableField && (
        <p className="hint" data-testid="performing-department-bundled-hint">
          The performing department can never be corrected, so it must be named on its own - raise the
          other fields as a separate request.
        </p>
      )}
      <label htmlFor="correction-comment">Comment to the owner of these fields</label>
      <textarea
        id="correction-comment"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        data-testid="correction-comment"
      />
      <div className="request-correction-form-actions">
        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy || selected.size === 0 || comment.trim().length === 0 || bundlesUncorrectableField}
          data-testid="submit-request-correction"
        >
          {busy ? "Requesting…" : "Request correction"}
        </button>
        <button type="button" onClick={() => setOpen(false)} disabled={busy}>
          Cancel
        </button>
      </div>
    </div>
  );
}

/** Whoever holds an authorization at its stage showing it to a named
 *  colleague (#62, BDR-0011) - available on every item this queue opens,
 *  since arriving here at all already means the acting participant is a
 *  holder (`isHolderOf` in `queues/index.ts`: the same population that fills
 *  an Approver's, a Contributor's or the Charge Number Admin's queue, plus
 *  whoever an outstanding correction is addressed to). Collapsed behind a
 *  toggle, the same as `RequestCorrectionForm`, so it never competes with
 *  the stage's own action for attention. */
function ReferForm({
  actingId,
  authorization,
  onReferred,
}: {
  actingId: string;
  authorization: Authorization;
  onReferred: (authorization: Authorization) => void;
}) {
  const [open, setOpen] = useState(false);
  const [participants, setParticipants] = useState<Participant[] | null>(null);
  const [colleagueId, setColleagueId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || participants !== null) return;
    let cancelled = false;
    void api.listParticipants(actingId).then((people) => {
      if (!cancelled) setParticipants(people);
    });
    return () => {
      cancelled = true;
    };
  }, [open, participants, actingId]);

  // A colleague, not the referrer themselves or the system identity - the
  // same two exclusions the service itself refuses (`refer` in
  // `service/index.ts`), applied here too so the dropdown never offers a
  // choice the submit would only reject.
  const colleagues = (participants ?? []).filter(
    (p) => p.id !== actingId && p.id !== SYSTEM_PARTICIPANT_ID,
  );

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const updated = await api.refer(actingId, authorization.id, { colleagueId });
      onReferred(updated);
      setOpen(false);
      setColleagueId("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} data-testid="open-refer">
        Refer to a colleague
      </button>
    );
  }

  return (
    <div className="refer-form" data-testid="refer-form">
      <h4>Refer to a colleague</h4>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <label htmlFor="refer-colleague">Colleague</label>
      <select
        id="refer-colleague"
        value={colleagueId}
        onChange={(e) => setColleagueId(e.target.value)}
        disabled={busy || participants === null}
        data-testid="refer-colleague"
      >
        <option value="">Choose a colleague</option>
        {colleagues.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <div className="refer-form-actions">
        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy || colleagueId === ""}
          data-testid="submit-refer"
        >
          {busy ? "Referring…" : "Refer"}
        </button>
        <button type="button" onClick={() => setOpen(false)} disabled={busy}>
          Cancel
        </button>
      </div>
    </div>
  );
}

/** One resource line, held as strings while it is being typed (#59, mirrors
 *  `DraftForm`'s own resource inputs) - converted to numbers only at
 *  submission. */
type ResourceDraft = { budgetHours: string; laborRate: string };

/** The field's owner supplying the fix (#59, CONTEXT.md: "made on the
 *  authorization where it stands"). Renders one control per field the
 *  outstanding request named, using the same control each field's draft
 *  entry uses (`DraftForm.tsx`) - a select for an enum, the department
 *  picker for a department, a resource editor for `resources` - so a
 *  corrector never sees a form that looks unlike the one that first
 *  collected the value. */
function CorrectionFulfillmentForm({
  actingId,
  authorization,
  onCorrected,
}: {
  actingId: string;
  authorization: Authorization;
  onCorrected: (authorization: Authorization) => void;
}) {
  const request = authorization.correctionRequest!;
  // Pre-filled with the authorization's current value for every named field
  // but the three with their own dedicated state below - a corrector edits
  // what is there rather than retyping it from memory, the same as
  // `resourceRows` already does for `resources`. `authorization` has no
  // index signature, so the lookup goes through an untyped view of it
  // rather than a switch over every field name.
  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    const raw = authorization as unknown as Record<string, unknown>;
    for (const field of request.fields) {
      if (field === "requestingDepartmentId" || field === "performingDepartmentId" || field === "resources") continue;
      if (typeof raw[field] === "string") initial[field] = raw[field] as string;
    }
    return initial;
  });
  const [requestingDept, setRequestingDept] = useState<ResolvedDepartment | null>(null);
  const [resourceRows, setResourceRows] = useState<ResourceDraft[]>(
    authorization.resources.map((r) => ({ budgetHours: String(r.budgetHours), laborRate: String(r.laborRate) })),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The one field pre-filled asynchronously rather than from `authorization`
  // directly: a department is shown by name, which means resolving its id
  // first, the same round trip `DraftForm.tsx` already makes for its own two
  // department pickers.
  useEffect(() => {
    if (!request.fields.includes("requestingDepartmentId")) return;
    let cancelled = false;
    void api.getDepartment(actingId, authorization.requestingDepartmentId).then((d) => {
      if (!cancelled) setRequestingDept(d);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- request.fields
    // is stable for the life of one outstanding correction, tied to the
    // same authorization this already depends on.
  }, [actingId, authorization.requestingDepartmentId]);

  const setValue = (field: CorrectableFieldKey, value: string) => setValues((prev) => ({ ...prev, [field]: value }));

  const addResourceRow = () => setResourceRows((prev) => [...prev, { budgetHours: "", laborRate: "" }]);
  const removeResourceRow = (index: number) =>
    setResourceRows((prev) => prev.filter((_, i) => i !== index));
  const updateResourceRow = (index: number, patch: Partial<ResourceDraft>) =>
    setResourceRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  if (request.fields.includes("performingDepartmentId")) {
    return (
      <div className="correction-fulfillment-form" data-testid="correction-fulfillment-form">
        <h4>Awaiting correction</h4>
        <p className="field-guidance">
          <strong>Comment:</strong> {request.comment}
        </p>
        <p role="alert" className="error" data-testid="performing-department-uncorrectable">
          The performing department was named, but it cannot be corrected - it is fixed once the
          authorization is initiated. Withdraw this authorization and raise a new one against the right
          department.
        </p>
      </div>
    );
  }

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const fields: Record<string, unknown> = {};
      for (const field of request.fields) {
        if (field === "requestingDepartmentId") fields[field] = requestingDept?.id ?? null;
        else if (field === "resources") {
          fields[field] = resourceRows.map((row) => ({
            budgetHours: Number(row.budgetHours),
            laborRate: Number(row.laborRate),
          }));
        } else {
          fields[field] = values[field]?.trim() === "" ? null : values[field];
        }
      }
      const updated = await api.correct(actingId, authorization.id, fields);
      onCorrected(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
      setBusy(false);
    }
  };

  return (
    <div className="correction-fulfillment-form" data-testid="correction-fulfillment-form">
      <h4>Awaiting correction</h4>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <p className="field-guidance">
        <strong>Comment:</strong> {request.comment}
      </p>

      {request.fields.map((field) => {
        if (field === "requestingDepartmentId") {
          return (
            <DepartmentPicker
              key={field}
              testId="correction-requesting-department"
              label={FIELD_LABELS[field]}
              actingId={actingId}
              selected={requestingDept}
              onSelect={setRequestingDept}
            />
          );
        }
        if (field === "fundingType") {
          return (
            <div key={field}>
              <label htmlFor={`correction-field-value-${field}`}>{FIELD_LABELS[field]}</label>
              <select
                id={`correction-field-value-${field}`}
                value={values[field] ?? ""}
                onChange={(e) => setValue(field, e.target.value)}
                data-testid={`correction-field-value-${field}`}
              >
                <option value="">Not yet chosen</option>
                {FUNDING_TYPE_VALUES.map((value) => (
                  <option key={value} value={value}>
                    {FUNDING_TYPE_LABELS[value as FundingType]}
                  </option>
                ))}
              </select>
            </div>
          );
        }
        if (field === "requestingLocationType" || field === "performingLocationType") {
          return (
            <div key={field}>
              <label htmlFor={`correction-field-value-${field}`}>{FIELD_LABELS[field]}</label>
              <select
                id={`correction-field-value-${field}`}
                value={values[field] ?? ""}
                onChange={(e) => setValue(field, e.target.value)}
                data-testid={`correction-field-value-${field}`}
              >
                <option value="">Not yet chosen</option>
                {LOCATION_TYPE_VALUES.map((value) => (
                  <option key={value} value={value}>
                    {LOCATION_TYPE_LABELS[value as LocationType]}
                  </option>
                ))}
              </select>
            </div>
          );
        }
        if (field === "resources") {
          return (
            <section key={field} aria-labelledby="correction-resources-heading" data-testid="correction-resources">
              <h5 id="correction-resources-heading">{FIELD_LABELS[field]}</h5>
              {resourceRows.map((row, index) => (
                <div key={index} className="correction-resource-row" data-testid="correction-resource-row">
                  <label htmlFor={`correction-resource-hours-${index}`}>Budget hours</label>
                  <input
                    id={`correction-resource-hours-${index}`}
                    type="number"
                    min="0"
                    value={row.budgetHours}
                    onChange={(e) => updateResourceRow(index, { budgetHours: e.target.value })}
                  />
                  <label htmlFor={`correction-resource-rate-${index}`}>Labor rate</label>
                  <input
                    id={`correction-resource-rate-${index}`}
                    type="number"
                    min="0"
                    value={row.laborRate}
                    onChange={(e) => updateResourceRow(index, { laborRate: e.target.value })}
                  />
                  <button type="button" onClick={() => removeResourceRow(index)}>
                    Remove
                  </button>
                </div>
              ))}
              <button type="button" onClick={addResourceRow}>
                Add resource
              </button>
            </section>
          );
        }
        // Every remaining correctable field is free text: project, the four
        // named approvers, the performing-side contact, and the employee
        // performing the work - the same control each uses on the draft or
        // the contribution form.
        return (
          <div key={field}>
            <label htmlFor={`correction-field-value-${field}`}>{FIELD_LABELS[field]}</label>
            <input
              id={`correction-field-value-${field}`}
              type="text"
              value={values[field] ?? ""}
              onChange={(e) => setValue(field, e.target.value)}
              data-testid={`correction-field-value-${field}`}
            />
          </div>
        );
      })}

      <button type="button" onClick={() => void submit()} disabled={busy} data-testid="submit-correction">
        {busy ? "Submitting…" : "Submit correction"}
      </button>
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
  const [chargeNumber, setChargeNumber] = useState("");
  const criteria = STAGE_CRITERIA[authorization.currentStageId];
  const relayStage = RELAY_CONFIG.find((s) => s.id === authorization.currentStageId)!;
  const isContribution = isContributionStage(relayStage);
  const isMint = isMintStage(relayStage);
  const isClaimant = authorization.performingContributorId === actingId;
  // Mirrors `isHolderOf` in `queues/index.ts`: everyone this queue shows is
  // a holder except a contributor colleague viewing an item somebody else
  // already claimed - `listContributorQueue` shows claimed and unclaimed
  // alike, but only the claimant (or, before a claim, anyone eligible to
  // make one) still holds it once claimed.
  const isHolder = !isContribution || authorization.performingContributorId === null || isClaimant;

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

  const mint = async () => {
    setBusy(true);
    setError(null);
    try {
      const updated = await api.mintChargeNumber(actingId, authorization.id, { chargeNumber });
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

      {authorization.isReReview && (
        // Re-review (#60, CONTEXT.md): this approver already acted on this
        // stage once. Told which of the two things moved beneath them - the
        // rules or the request - so a fresh arrival is never confused with
        // one.
        <p role="status" data-testid="re-review-notice">
          You already acted on this stage.{" "}
          {authorization.reReviewCause === "configuration-change"
            ? "The relay's configuration changed since then."
            : "A correction changed a field this stage depends on."}
        </p>
      )}

      <section aria-labelledby="queue-item-stage-heading" data-testid="queue-item-stage">
        <h4 id="queue-item-stage-heading">This stage's criteria</h4>
        <p>
          <strong>{criteria.concern}:</strong> {criteria.criteria}
        </p>
      </section>

      <div className="queue-item-actions">
        {authorization.awaitingCorrection ? (
          // Awaiting correction (#59): whoever opened this from their queue
          // is, by construction, the correction's owner - `listMyQueue`
          // never shows it to anyone else - so the fulfillment form is the
          // whole of this branch, with no acknowledge, claim or contribute
          // control beside it to compete for attention.
          <CorrectionFulfillmentForm actingId={actingId} authorization={authorization} onCorrected={onResolved} />
        ) : isContribution ? (
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
        ) : isMint ? (
          <>
            <label htmlFor="charge-number">Charge number</label>
            <input
              id="charge-number"
              type="text"
              value={chargeNumber}
              onChange={(e) => setChargeNumber(e.target.value)}
              disabled={busy}
            />
            <button
              type="button"
              onClick={() => void mint()}
              disabled={busy || chargeNumber.trim().length === 0}
              data-testid="mint"
            >
              {busy ? "Minting…" : "Mint"}
            </button>
          </>
        ) : (
          <>
            <button type="button" onClick={() => void acknowledge()} disabled={busy} data-testid="acknowledge">
              {busy ? "Acknowledging…" : "Acknowledge"}
            </button>
            <RequestCorrectionForm actingId={actingId} authorization={authorization} onRequested={onResolved} />
          </>
        )}
        {isHolder && <ReferForm actingId={actingId} authorization={authorization} onReferred={onClaimed} />}
        <button type="button" onClick={onClose} disabled={busy}>
          Close
        </button>
      </div>
    </div>
  );
}

/** How often a queue polls for what has arrived since the last look
 *  (CONTEXT.md: "Notification" - "a push to a role when an authorization
 *  arrives in their queue"). The prototype has no session or socket to push
 *  over (docs/business-case.md rules authentication out of scope), so a
 *  poll standing in for one is the simplest thing that still lets someone
 *  already looking at their queue see an arrival without reloading. */
const QUEUE_POLL_MS = 3000;

/** One authorization noticed as newly arrived since the previous poll -
 *  what a notification banner names, and what a person dismisses once
 *  they have seen it. `key` is a surrogate, distinct from
 *  `authorizationId`: an authorization can arrive more than once (a hold
 *  released, a referral, a re-review, #60/#61/#62 each put it back in this
 *  same queue) while an earlier notification for the same id is still
 *  showing, and keying or dismissing by `authorizationId` alone would
 *  collide the two rather than treating each arrival as its own event. */
type ArrivalNotification = { key: string; authorizationId: string; project: string };

function arrivalMessage(project: string): string {
  return `${project} has arrived in your queue.`;
}

export function MyQueue({ actingId }: MyQueueProps) {
  const [items, setItems] = useState<Authorization[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<ArrivalNotification[]>([]);
  // Mirrors the notification banner below into a visually-hidden live
  // region, portaled out from under this tab's own panel (see the portal
  // near the end of this component) - the browser drops the banner itself
  // from the accessibility tree whenever another tab is active, the same as
  // any ARIA tabs pattern does for inactive content.
  const [announcement, setAnnouncement] = useState("");

  const latest = useRef(0);
  // `null` until the first successful poll for the participant currently
  // acting - compared against on every poll after that to tell "newly
  // arrived" apart from "was already here." Left `null` rather than an
  // empty set so the very first load of a freshly chosen identity never
  // reads their whole existing queue as a batch of arrivals.
  const seenIds = useRef<Set<string> | null>(null);

  const load = useCallback(async (actor: string) => {
    const seq = ++latest.current;
    try {
      const mine = await api.listMyQueue(actor);
      if (seq !== latest.current) return;
      setItems(mine);
      const currentIds = new Set(mine.map((a) => a.id));
      if (seenIds.current !== null) {
        const arrived = mine.filter((a) => !seenIds.current!.has(a.id));
        if (arrived.length > 0) {
          setNotifications((prev) => [
            ...prev,
            ...arrived.map((a) => ({ key: crypto.randomUUID(), authorizationId: a.id, project: a.project })),
          ]);
          // One combined announcement, not one call per arrival: a plain
          // `setState` per item would collapse under React's batching and
          // leave only the last arrival's text live. Cleared first and set
          // on the next frame so a repeat of the exact same text - the same
          // authorization arriving again via a hold release, a referral, or
          // a re-review, per this file's own `ArrivalNotification` comment -
          // still mutates the DOM and gets announced; most screen readers
          // stay silent on a live region whose text didn't actually change.
          const message = arrived.map((a) => arrivalMessage(a.project)).join(" ");
          setAnnouncement("");
          requestAnimationFrame(() => setAnnouncement(message));
        }
      }
      seenIds.current = currentIds;
    } catch (err) {
      if (seq === latest.current) {
        setError(err instanceof ApiError ? err.message : String(err));
      }
    }
  }, []);

  useEffect(() => {
    setOpenId(null);
    setNotifications([]);
    setAnnouncement("");
    seenIds.current = null;
    void load(actingId);
  }, [load, actingId]);

  // Polls in the background so an arrival is noticed while this participant
  // is already looking at their queue, not only the next time they switch
  // identity or reload the page. Paused while an item is open: refreshing
  // `items` underneath an open `OpenAuthorization` can otherwise make it
  // disappear mid-interaction (its `open` lookup below turns up nothing)
  // if the item it names left this queue in the meantime - discarding
  // whatever the person was in the middle of doing there.
  useEffect(() => {
    const interval = setInterval(() => {
      if (openId === null) void load(actingId);
    }, QUEUE_POLL_MS);
    return () => clearInterval(interval);
  }, [load, actingId, openId]);

  const dismissNotification = (key: string) => {
    setNotifications((prev) => prev.filter((n) => n.key !== key));
  };

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
    <>
      {createPortal(
        <p aria-live="polite" className="sr-only" data-testid="queue-arrival-announcement">
          {announcement}
        </p>,
        document.body,
      )}
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

        {notifications.length > 0 && (
          <ul className="notification-list" data-testid="notification-list">
            {notifications.map((notification) => (
              <li key={notification.key} role="status" data-testid="arrival-notification">
                <span>{arrivalMessage(notification.project)}</span>
                <button type="button" onClick={() => dismissNotification(notification.key)}>
                  Dismiss
                </button>
              </li>
            ))}
          </ul>
        )}

        <ul className="card-list queue-list" data-testid="queue-list">
          {items === null ? (
            <li className="hint">Loading…</li>
          ) : items.length === 0 ? (
            <li className="hint">Nothing is waiting on you.</li>
          ) : (
            items.map((authorization) => {
              const relayStage = RELAY_CONFIG.find((s) => s.id === authorization.currentStageId)!;
              const hasBadges =
                isContributionStage(relayStage) || authorization.awaitingCorrection || authorization.isReReview;
              return (
                <li key={authorization.id} className="card queue-card" data-testid="queue-row">
                  <div className="card-header">
                    <span className="card-title">{authorization.project}</span>
                    <button type="button" onClick={() => setOpenId(authorization.id)}>
                      Open
                    </button>
                  </div>
                  {hasBadges && (
                    <div className="card-badges">
                      {isContributionStage(relayStage) && (
                        <span
                          className={
                            authorization.performingContributorId === null ? "badge" : "badge badge-good"
                          }
                          data-testid="claim-status"
                        >
                          {authorization.performingContributorId === null ? "Unclaimed" : "Claimed"}
                        </span>
                      )}
                      {authorization.awaitingCorrection && (
                        <span className="badge badge-warning" data-testid="awaiting-correction">
                          Awaiting your correction
                        </span>
                      )}
                      {authorization.isReReview && (
                        <span className="badge badge-info" data-testid="re-review">
                          Re-review
                          {authorization.reReviewCause === "configuration-change"
                            ? " (the rules changed)"
                            : " (a correction changed this)"}
                        </span>
                      )}
                    </div>
                  )}
                </li>
              );
            })
          )}
        </ul>

        {open && (
          // Keyed by id so switching the open row directly - clicking another
          // "Open" without Close first - remounts rather than reuses this
          // instance. Without it, `OpenAuthorization`'s own state (the
          // employee-name input, and #59's correction form fields) would carry
          // the previous authorization's half-typed values into whatever gets
          // opened next.
          <OpenAuthorization
            key={open.id}
            actingId={actingId}
            authorization={open}
            onResolved={onResolved}
            onClaimed={onClaimed}
            onClose={() => setOpenId(null)}
          />
        )}
      </section>
    </>
  );
}
