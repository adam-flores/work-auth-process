import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "./api.ts";
import type { Draft } from "./api.ts";
import { DraftForm } from "./DraftForm.tsx";
import { SYSTEM_PARTICIPANT_ID } from "../shared/constants.ts";

/**
 * A submitter's own queue of drafts (#51, CONTEXT.md: "visible ... in its
 * submitter's queue and on the master dashboard"). The master dashboard does
 * not exist yet, so this is the one place a draft is visible today - a
 * scope this component's own name is honest about.
 */

export type MyDraftsProps = { actingId: string };

export function MyDrafts({ actingId }: MyDraftsProps) {
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const latest = useRef(0);

  const load = useCallback(async (actor: string) => {
    const seq = ++latest.current;
    try {
      const mine = await api.listMyDrafts(actor);
      if (seq === latest.current) setDrafts(mine);
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

  const createDraft = async () => {
    setBusy(true);
    setError(null);
    try {
      const draft = await api.createDraft(actingId);
      setDrafts((prev) => [draft, ...(prev ?? [])]);
      setOpenId(draft.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const openDraft = (id: string) => {
    setOpenId(id);
    setError(null);
  };

  const onSaved = (draft: Draft) => {
    setDrafts((prev) => (prev ?? []).map((d) => (d.id === draft.id ? draft : d)));
  };

  const onDeleted = () => {
    setDrafts((prev) => (prev ?? []).filter((d) => d.id !== openId));
    setOpenId(null);
  };

  // Initiation discharges the draft the same way deletion does (ADR-0009) -
  // it leaves this list and the form closes. Where it goes next is the
  // Approver's queue it just arrived in, not this component's concern.
  const onInitiated = () => {
    setDrafts((prev) => (prev ?? []).filter((d) => d.id !== openId));
    setOpenId(null);
  };

  const open = drafts?.find((d) => d.id === openId) ?? null;
  const canSubmit = actingId !== SYSTEM_PARTICIPANT_ID;

  return (
    <section aria-labelledby="drafts-heading" data-testid="my-drafts">
      <h2 id="drafts-heading">My drafts</h2>
      <p className="hint">
        A draft is mutable and keeps no history (ADR-0009): save it, come back to it, or delete it -
        an untouched one is removed by the system after a month regardless.
      </p>

      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={() => void createDraft()}
        disabled={busy || !canSubmit}
        data-testid="new-draft"
      >
        New draft
      </button>
      {!canSubmit && (
        <p className="hint">Choose who you are acting as, above, before starting a draft.</p>
      )}

      <ul className="draft-list" data-testid="draft-list">
        {drafts === null ? (
          <li className="hint">Loading…</li>
        ) : drafts.length === 0 ? (
          <li className="hint">No drafts yet.</li>
        ) : (
          drafts.map((draft) => (
            <li key={draft.id} data-testid="draft-row">
              <span>{draft.project?.trim() || "Untitled draft"}</span>
              <button type="button" onClick={() => openDraft(draft.id)}>
                Open
              </button>
            </li>
          ))
        )}
      </ul>

      {open && (
        <DraftForm
          actingId={actingId}
          draft={open}
          onSaved={onSaved}
          onDeleted={onDeleted}
          onInitiated={onInitiated}
          onClose={() => setOpenId(null)}
        />
      )}
    </section>
  );
}
