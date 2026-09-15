import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "./api.ts";
import type { ResolvedDepartment, StoreInfo } from "./api.ts";
import { DepartmentPicker } from "./DepartmentPicker.tsx";
import { SYSTEM_PARTICIPANT_ID } from "../shared/constants.ts";
import type { Participant } from "../shared/rules.ts";

/**
 * The walking skeleton's one screen. It exists to prove the path a request
 * takes - browser to HTTP adapter to service to store and back - and to carry
 * the participant switcher, which is the concrete form mocked identity takes
 * (ADR-0010: the caller says who is acting).
 */
export function App() {
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [actingId, setActingId] = useState(SYSTEM_PARTICIPANT_ID);
  const [store, setStore] = useState<StoreInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [requestingDept, setRequestingDept] = useState<ResolvedDepartment | null>(null);
  const [performingDept, setPerformingDept] = useState<ResolvedDepartment | null>(null);

  // Switching actor twice quickly leaves two reads in flight. Only the newest
  // may paint - otherwise a slow failure from the actor you just left lands on
  // top of the valid data for the one you just chose, and nothing clears it.
  const latestLoad = useRef(0);

  const load = useCallback(async (actor: string) => {
    const seq = ++latestLoad.current;
    setError(null);
    try {
      const [people, info] = await Promise.all([api.listParticipants(actor), api.getStoreInfo(actor)]);
      if (seq !== latestLoad.current) return;
      setParticipants(people);
      setStore(info);
    } catch (err) {
      if (seq !== latestLoad.current) return;
      setError(err instanceof ApiError ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void load(actingId);
  }, [load, actingId]);

  const reset = async () => {
    setBusy(true);
    setError(null);
    try {
      setStore(await api.resetStore(actingId));
      await load(actingId);
      // A reseed can rebuild department ids from scratch, so a selection made
      // against the old store may no longer resolve to anything real.
      setRequestingDept(null);
      setPerformingDept(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const acting = participants.find((p) => p.id === actingId);

  return (
    <main>
      <header>
        <h1>Work Authorization</h1>
        <p className="subtitle">
          Prototype for a large aerospace manufacturer's internal work authorization process.
          Every participant is mocked.
        </p>
      </header>

      <section aria-labelledby="acting-heading">
        <h2 id="acting-heading">Acting as</h2>
        <label htmlFor="acting-participant">Participant</label>
        <select
          id="acting-participant"
          value={actingId}
          onChange={(e) => setActingId(e.target.value)}
        >
          <option value={SYSTEM_PARTICIPANT_ID}>system (the product itself)</option>
          {participants.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} — {p.role}
            </option>
          ))}
        </select>
        <p className="acting-detail" data-testid="acting-detail">
          {acting
            ? `${acting.name} is a ${acting.role} in ${acting.department}.`
            : "Acting as the product itself, which holds no role and belongs to no department."}
        </p>
      </section>

      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}

      <section aria-labelledby="store-heading">
        <h2 id="store-heading">The store</h2>
        {store ? (
          <dl data-testid="store-info">
            <dt>Schema version</dt>
            <dd>{store.schemaVersion}</dd>
            <dt>Seeded</dt>
            <dd>
              {/* The machine-readable value as well as the readable one: the
                  displayed form is only accurate to the second, and two seedings
                  can fall inside one second. */}
              <time dateTime={store.seededAt}>{new Date(store.seededAt).toLocaleString()}</time>
            </dd>
            <dt>Participants</dt>
            <dd data-testid="participant-count">{store.participantCount}</dd>
          </dl>
        ) : (
          <p>Reading…</p>
        )}
        <button type="button" onClick={() => void reset()} disabled={busy}>
          {busy ? "Resetting…" : "Reset the store"}
        </button>
        <p className="hint">
          The store is disposable and rebuilt by seeding rather than migrated, so a demo can be
          returned to a known state between walkthroughs.
        </p>
      </section>

      <section aria-labelledby="roster-heading">
        <h2 id="roster-heading">Participants</h2>
        <table>
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Role</th>
              <th scope="col">Department</th>
            </tr>
          </thead>
          <tbody data-testid="participant-rows">
            {participants.map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td>{p.role}</td>
                <td>{p.department}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section aria-labelledby="department-picker-heading">
        <h2 id="department-picker-heading">Find a department</h2>
        <p className="hint">
          One picker, used for both sides of an authorization (BDR-0008): narrow on any
          attribute, then search what remains by name. Shown standalone here, ahead of the
          draft it will be embedded in (#51) — reset the store above to clear a selection.
        </p>
        <div className="department-pickers">
          <DepartmentPicker
            testId="requesting-department"
            label="Requesting department"
            actingId={actingId}
            selected={requestingDept}
            onSelect={setRequestingDept}
          />
          <DepartmentPicker
            testId="performing-department"
            label="Performing department"
            actingId={actingId}
            selected={performingDept}
            onSelect={setPerformingDept}
          />
        </div>
      </section>
    </main>
  );
}
