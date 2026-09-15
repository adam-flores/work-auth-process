import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "./api.ts";
import type { PermissibilityRule } from "./api.ts";
import { JURISDICTION_LABELS, JURISDICTION_VALUES } from "../shared/constants.ts";
import type { Jurisdiction } from "../shared/constants.ts";

/**
 * The Administrator's surface over the permissibility list (#53, BDR-0007,
 * ADR-0011): a pairing of jurisdictions that may not work together, added
 * and removed here and taking effect on the next draft saved - no build.
 *
 * A rule names the requesting side's jurisdiction and the performing side's;
 * direction matters, which is why the form asks for both rather than one
 * "disallowed jurisdiction" checkbox.
 */

function describe(rule: PermissibilityRule): string {
  return (
    `A ${JURISDICTION_LABELS[rule.performingJurisdiction].toLowerCase()} department may not perform ` +
    `work for a ${JURISDICTION_LABELS[rule.requestingJurisdiction].toLowerCase()} one.`
  );
}

export type PermissibilityRulesProps = { actingId: string; isAdministrator: boolean };

export function PermissibilityRules({ actingId, isAdministrator }: PermissibilityRulesProps) {
  const [rules, setRules] = useState<PermissibilityRule[] | null>(null);
  const [requestingJurisdiction, setRequestingJurisdiction] = useState<Jurisdiction>(
    JURISDICTION_VALUES[0],
  );
  const [performingJurisdiction, setPerformingJurisdiction] = useState<Jurisdiction>(
    JURISDICTION_VALUES[0],
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const latest = useRef(0);

  const load = useCallback(async (actor: string) => {
    const seq = ++latest.current;
    try {
      const found = await api.listPermissibilityRules(actor);
      if (seq === latest.current) setRules(found);
    } catch (err) {
      if (seq === latest.current) {
        setError(err instanceof ApiError ? err.message : String(err));
      }
    }
  }, []);

  useEffect(() => {
    void load(actingId);
  }, [load, actingId]);

  const addRule = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.addPermissibilityRule(actingId, { requestingJurisdiction, performingJurisdiction });
      await load(actingId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const removeRule = async (ruleId: string) => {
    if (removingId) return;
    setError(null);
    setRemovingId(ruleId);
    try {
      await api.removePermissibilityRule(actingId, ruleId);
      setRules((prev) => (prev ?? []).filter((r) => r.id !== ruleId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <section aria-labelledby="permissibility-rules-heading" data-testid="permissibility-rules">
      <h2 id="permissibility-rules-heading">Permissibility rules</h2>
      <p className="hint">
        A pairing of departments that may not work together, refused when it is entered rather than
        days later at a gate. The list is data - an Administrator adds and removes pairings here, and
        a change takes effect without a build.
      </p>

      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}

      <ul data-testid="permissibility-rule-list">
        {rules === null ? (
          <li className="hint">Loading…</li>
        ) : rules.length === 0 ? (
          <li className="hint">No rules - every pairing is permitted.</li>
        ) : (
          rules.map((rule) => (
            <li key={rule.id} data-testid="permissibility-rule-row">
              {describe(rule)}
              <button
                type="button"
                onClick={() => void removeRule(rule.id)}
                disabled={removingId !== null || !isAdministrator}
              >
                Remove
              </button>
            </li>
          ))
        )}
      </ul>

      {isAdministrator ? (
        <div className="permissibility-rule-form">
          <label htmlFor="permissibility-requesting-jurisdiction">Requesting side's jurisdiction</label>
          <select
            id="permissibility-requesting-jurisdiction"
            value={requestingJurisdiction}
            onChange={(e) => setRequestingJurisdiction(e.target.value as Jurisdiction)}
          >
            {JURISDICTION_VALUES.map((value) => (
              <option key={value} value={value}>
                {JURISDICTION_LABELS[value]}
              </option>
            ))}
          </select>

          <label htmlFor="permissibility-performing-jurisdiction">Performing side's jurisdiction</label>
          <select
            id="permissibility-performing-jurisdiction"
            value={performingJurisdiction}
            onChange={(e) => setPerformingJurisdiction(e.target.value as Jurisdiction)}
          >
            {JURISDICTION_VALUES.map((value) => (
              <option key={value} value={value}>
                {JURISDICTION_LABELS[value]}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => void addRule()}
            disabled={busy}
            data-testid="add-permissibility-rule"
          >
            {busy ? "Adding…" : "Add pairing"}
          </button>
        </div>
      ) : (
        <p className="hint">Act as an Administrator to add or remove a pairing.</p>
      )}
    </section>
  );
}
