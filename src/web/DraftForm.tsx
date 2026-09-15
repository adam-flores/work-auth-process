import { useEffect, useState } from "react";
import { api, ApiError } from "./api.ts";
import type { Draft, ResolvedDepartment } from "./api.ts";
import { DepartmentPicker } from "./DepartmentPicker.tsx";
import {
  FUNDING_TYPE_LABELS,
  FUNDING_TYPE_VALUES,
  LOCATION_TYPE_LABELS,
  LOCATION_TYPE_VALUES,
} from "../shared/constants.ts";
import type { FundingType, LocationType } from "../shared/constants.ts";
import { DraftFields } from "../shared/rules.ts";
import type { DraftFieldsInput } from "../shared/rules.ts";
import { FIELD_GUIDANCE } from "../guidance/content.ts";

/**
 * One draft, open for editing (#51, ADR-0009). Saved as a whole: every field
 * below travels together on "Save," which is what lets a submitter gather
 * what they are missing across several sittings without ever half-writing a
 * record (a draft is allowed to be incomplete; nothing here enforces
 * completeness - that is initiation's job, in a later ticket). Resources are
 * the one exception, added and removed immediately rather than staged for
 * Save, because BDR-0007 describes them as changing freely on their own.
 *
 * Every field carries its guidance at the point of entry (#52), read from
 * the same content the criteria that guidance explains will be (a later
 * ticket, once an approver surface exists). `DraftFields` - the same rule
 * module the service imports - runs here too, before "Save" ever reaches
 * the network: the browser's copy is for immediacy, and is never the
 * enforcement, so the server still re-validates everything it receives.
 */

/** Guidance rendered next to the field it belongs to, not a tooltip
 *  (CONTEXT.md: avoid "help text, tooltip, hint") - visible at the point of
 *  entry rather than behind a hover. */
function Guidance({ field }: { field: keyof typeof FIELD_GUIDANCE }) {
  return (
    <p className="field-guidance" data-testid={`guidance-${field}`}>
      {FIELD_GUIDANCE[field].text}
    </p>
  );
}

/** An empty text input means "not entered," not the empty string - it is
 *  sent as `null` so a field can be cleared, not just filled in. */
const orNull = (value: string): string | null => (value.trim() === "" ? null : value.trim());

async function resolveDepartment(actingId: string, id: string | null): Promise<ResolvedDepartment | null> {
  if (!id) return null;
  try {
    return await api.getDepartment(actingId, id);
  } catch (err) {
    // A department a draft names can genuinely vanish underneath it
    // (BDR-0010's inactive departments stay resolvable, but a hierarchy
    // reshape is not modeled here) - that one case falls back to no
    // selection rather than throwing the whole page over it. Anything else
    // (a network blip, a 500) is not the same as "gone," and must not be
    // treated as one: silently clearing a still-valid selection here would
    // mean Save later overwrites it with null on the server.
    if (err instanceof ApiError && err.code === "UNKNOWN_DEPARTMENT") return null;
    throw err;
  }
}

export type DraftFormProps = {
  actingId: string;
  draft: Draft;
  onSaved: (draft: Draft) => void;
  onDeleted: () => void;
  onClose: () => void;
};

export function DraftForm({ actingId, draft, onSaved, onDeleted, onClose }: DraftFormProps) {
  const [current, setCurrent] = useState(draft);
  const [project, setProject] = useState(draft.project ?? "");
  const [requestingDept, setRequestingDept] = useState<ResolvedDepartment | null>(null);
  const [performingDept, setPerformingDept] = useState<ResolvedDepartment | null>(null);
  const [fundingType, setFundingType] = useState(draft.fundingType ?? "");
  const [requestingLocationType, setRequestingLocationType] = useState(draft.requestingLocationType ?? "");
  const [performingLocationType, setPerformingLocationType] = useState(draft.performingLocationType ?? "");
  const [requestingProgramManager, setRequestingProgramManager] = useState(
    draft.requestingProgramManager ?? "",
  );
  const [requestingFinanceApprover, setRequestingFinanceApprover] = useState(
    draft.requestingFinanceApprover ?? "",
  );
  const [performingProgramManager, setPerformingProgramManager] = useState(
    draft.performingProgramManager ?? "",
  );
  const [performingFinanceApprover, setPerformingFinanceApprover] = useState(
    draft.performingFinanceApprover ?? "",
  );
  const [performingContact, setPerformingContact] = useState(draft.performingContact ?? "");

  const [resourceHours, setResourceHours] = useState("");
  const [resourceRate, setResourceRate] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resourceBusy, setResourceBusy] = useState(false);
  const [removingResourceId, setRemovingResourceId] = useState<string | null>(null);

  // A fresh draft was opened: reset every field from it, including the
  // departments a picker cannot be handed as bare ids.
  useEffect(() => {
    setCurrent(draft);
    setProject(draft.project ?? "");
    setFundingType(draft.fundingType ?? "");
    setRequestingLocationType(draft.requestingLocationType ?? "");
    setPerformingLocationType(draft.performingLocationType ?? "");
    setRequestingProgramManager(draft.requestingProgramManager ?? "");
    setRequestingFinanceApprover(draft.requestingFinanceApprover ?? "");
    setPerformingProgramManager(draft.performingProgramManager ?? "");
    setPerformingFinanceApprover(draft.performingFinanceApprover ?? "");
    setPerformingContact(draft.performingContact ?? "");
    // Not part of the draft itself - but a resource typed and left unadded
    // belongs to the draft that was open when it was typed, not to whatever
    // is opened next.
    setResourceHours("");
    setResourceRate("");
    setError(null);

    let cancelled = false;
    const onFailure = (err: unknown) => {
      if (!cancelled) setError(err instanceof ApiError ? err.message : String(err));
    };
    void resolveDepartment(actingId, draft.requestingDepartmentId)
      .then((d) => {
        if (!cancelled) setRequestingDept(d);
      })
      .catch(onFailure);
    void resolveDepartment(actingId, draft.performingDepartmentId)
      .then((d) => {
        if (!cancelled) setPerformingDept(d);
      })
      .catch(onFailure);
    return () => {
      cancelled = true;
    };
    // Re-run only when a different draft is opened, not on every keystroke -
    // `draft` itself changes identity on every parent re-render.
  }, [draft.id, actingId]);

  const save = async () => {
    setError(null);
    const fields: DraftFieldsInput = {
      project: orNull(project),
      requestingDepartmentId: requestingDept?.id ?? null,
      performingDepartmentId: performingDept?.id ?? null,
      fundingType: (fundingType || null) as FundingType | null,
      requestingLocationType: (requestingLocationType || null) as LocationType | null,
      performingLocationType: (performingLocationType || null) as LocationType | null,
      requestingProgramManager: orNull(requestingProgramManager),
      requestingFinanceApprover: orNull(requestingFinanceApprover),
      performingProgramManager: orNull(performingProgramManager),
      performingFinanceApprover: orNull(performingFinanceApprover),
      performingContact: orNull(performingContact),
    };

    // Validation fires before submission (#52), reusing the exact schema
    // the service will apply anyway - so a malformed field is caught here,
    // at entry, rather than surfacing only after a round trip.
    const parsed = DraftFields.safeParse(fields);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid draft fields.");
      return;
    }

    setBusy(true);
    try {
      const saved = await api.updateDraft(actingId, draft.id, fields);
      setCurrent(saved);
      onSaved(saved);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.deleteDraft(actingId, draft.id);
      onDeleted();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
      setBusy(false);
    }
  };

  const addResource = async () => {
    if (resourceBusy) return;
    setError(null);
    const budgetHours = Number(resourceHours);
    const laborRate = Number(resourceRate);
    if (!Number.isFinite(budgetHours) || budgetHours <= 0 || !Number.isFinite(laborRate) || laborRate <= 0) {
      setError("Budget hours and labor rate must both be greater than zero.");
      return;
    }
    setResourceBusy(true);
    try {
      const updated = await api.addResource(actingId, draft.id, { budgetHours, laborRate });
      setCurrent(updated);
      onSaved(updated);
      setResourceHours("");
      setResourceRate("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setResourceBusy(false);
    }
  };

  const removeResource = async (resourceId: string) => {
    if (removingResourceId) return;
    setError(null);
    setRemovingResourceId(resourceId);
    try {
      const updated = await api.removeResource(actingId, draft.id, resourceId);
      setCurrent(updated);
      onSaved(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setRemovingResourceId(null);
    }
  };

  return (
    <div className="draft-form" data-testid="draft-form">
      <h3>{project.trim() || "Untitled draft"}</h3>

      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}

      <label htmlFor="draft-project">Project</label>
      <Guidance field="project" />
      <input id="draft-project" type="text" value={project} onChange={(e) => setProject(e.target.value)} />

      <div className="department-pickers">
        <div>
          <Guidance field="requestingDepartmentId" />
          <DepartmentPicker
            testId="draft-requesting-department"
            label="Requesting department"
            actingId={actingId}
            selected={requestingDept}
            onSelect={setRequestingDept}
          />
        </div>
        <div>
          <Guidance field="performingDepartmentId" />
          <DepartmentPicker
            testId="draft-performing-department"
            label="Performing department"
            actingId={actingId}
            selected={performingDept}
            onSelect={setPerformingDept}
          />
        </div>
      </div>

      <label htmlFor="draft-funding-type">Funding type</label>
      <Guidance field="fundingType" />
      <select
        id="draft-funding-type"
        value={fundingType}
        onChange={(e) => setFundingType(e.target.value as FundingType | "")}
      >
        <option value="">Not yet chosen</option>
        {FUNDING_TYPE_VALUES.map((value) => (
          <option key={value} value={value}>
            {FUNDING_TYPE_LABELS[value]}
          </option>
        ))}
      </select>

      <div className="draft-location-types">
        <div>
          <label htmlFor="draft-requesting-location-type">Requesting location type</label>
          <Guidance field="requestingLocationType" />
          <select
            id="draft-requesting-location-type"
            value={requestingLocationType}
            onChange={(e) => setRequestingLocationType(e.target.value as LocationType | "")}
          >
            <option value="">Not yet chosen</option>
            {LOCATION_TYPE_VALUES.map((value) => (
              <option key={value} value={value}>
                {LOCATION_TYPE_LABELS[value]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="draft-performing-location-type">Performing location type</label>
          <Guidance field="performingLocationType" />
          <select
            id="draft-performing-location-type"
            value={performingLocationType}
            onChange={(e) => setPerformingLocationType(e.target.value as LocationType | "")}
          >
            <option value="">Not yet chosen</option>
            {LOCATION_TYPE_VALUES.map((value) => (
              <option key={value} value={value}>
                {LOCATION_TYPE_LABELS[value]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="draft-named-approvers">
        <div>
          <label htmlFor="draft-requesting-program-manager">Requesting program manager</label>
          <Guidance field="requestingProgramManager" />
          <input
            id="draft-requesting-program-manager"
            type="text"
            value={requestingProgramManager}
            onChange={(e) => setRequestingProgramManager(e.target.value)}
          />
          <label htmlFor="draft-requesting-finance-approver">Requesting finance approver</label>
          <Guidance field="requestingFinanceApprover" />
          <input
            id="draft-requesting-finance-approver"
            type="text"
            value={requestingFinanceApprover}
            onChange={(e) => setRequestingFinanceApprover(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="draft-performing-program-manager">Performing program manager</label>
          <Guidance field="performingProgramManager" />
          <input
            id="draft-performing-program-manager"
            type="text"
            value={performingProgramManager}
            onChange={(e) => setPerformingProgramManager(e.target.value)}
          />
          <label htmlFor="draft-performing-finance-approver">Performing finance approver</label>
          <Guidance field="performingFinanceApprover" />
          <input
            id="draft-performing-finance-approver"
            type="text"
            value={performingFinanceApprover}
            onChange={(e) => setPerformingFinanceApprover(e.target.value)}
          />
          <label htmlFor="draft-performing-contact">Performing-side contact (optional)</label>
          <Guidance field="performingContact" />
          <input
            id="draft-performing-contact"
            type="text"
            value={performingContact}
            onChange={(e) => setPerformingContact(e.target.value)}
          />
        </div>
      </div>

      <section aria-labelledby="draft-resources-heading" data-testid="draft-resources">
        <h4 id="draft-resources-heading">Resources</h4>
        <Guidance field="resources" />
        <ul>
          {current.resources.map((resource) => (
            <li key={resource.id} data-testid="draft-resource-row">
              {resource.budgetHours} hrs @ ${resource.laborRate}/hr
              <button
                type="button"
                onClick={() => void removeResource(resource.id)}
                disabled={removingResourceId !== null}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
        <label htmlFor="draft-resource-hours">Budget hours</label>
        <input
          id="draft-resource-hours"
          type="number"
          min="0"
          value={resourceHours}
          onChange={(e) => setResourceHours(e.target.value)}
        />
        <label htmlFor="draft-resource-rate">Labor rate</label>
        <input
          id="draft-resource-rate"
          type="number"
          min="0"
          value={resourceRate}
          onChange={(e) => setResourceRate(e.target.value)}
        />
        <button type="button" onClick={() => void addResource()} disabled={resourceBusy}>
          Add resource
        </button>
      </section>

      <div className="draft-form-actions">
        <button type="button" onClick={() => void save()} disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={onClose} disabled={busy}>
          Close
        </button>
        <button type="button" onClick={() => void remove()} disabled={busy} data-testid="delete-draft">
          Delete draft
        </button>
      </div>
    </div>
  );
}
