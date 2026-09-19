import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "./api.ts";
import type { DemoState } from "./api.ts";
import { SYSTEM_PARTICIPANT_ID } from "../shared/constants.ts";

/**
 * The scripted demo player's control bar (#94): Start, Pause, Continue,
 * Reset. Lives in the persistent header (#91) alongside the acting-as
 * switcher, since it drives both that switcher and the active tab itself as
 * the story requires (user stories 1, 2, 3, 5).
 *
 * The server holds the authoritative status and step index
 * (`src/demo/index.ts`) - this component polls `GET /api/demo` once on
 * mount so a page refresh mid-demo reflects the true state, then advances
 * the story itself by calling `POST /api/demo/advance` on a fixed interval
 * while running (client-paced advancing, #94), rather than running any
 * timer of its own on the server.
 *
 * Which participant is "acting" and which tab is showing are both owned by
 * `App.tsx`; this component only calls back into it when the step that just
 * ran names a different one, exactly the way a presenter's own click
 * would.
 */

/** How long a step's result stays on screen before the next one runs -
 *  enough for an audience to read what changed (#94, user story 6). */
const DEMO_STEP_MS = 4000;

export type DemoPlayerProps = {
  onActingIdChange: (id: string) => void;
  onTabChange: (tabId: string) => void;
  /** Called after a successful reset, so `App.tsx` can reload the store info
   *  and participant roster its own header shows - the demo's reset and the
   *  header's own "Reset the store" button return the store to the same
   *  seeded state (`src/demo/index.ts`: reset calls the same store-reset
   *  mechanism). */
  onReset: () => void;
};

function applyStep(state: DemoState, onActingIdChange: (id: string) => void, onTabChange: (id: string) => void) {
  if (!state.current) return;
  onActingIdChange(state.current.actingId);
  onTabChange(state.current.tabId);
}

export function DemoPlayer({ onActingIdChange, onTabChange, onReset }: DemoPlayerProps) {
  const [state, setState] = useState<DemoState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Every call below - the mount fetch, each button, and the advance
  // interval - bumps this before it goes out, and only the response whose
  // sequence number is still current is allowed to paint. Without it, two
  // requests in flight at once (most plausibly the mount fetch still
  // pending when someone clicks Start right away) could resolve out of
  // order and let a stale read overwrite a fresher one - the same race
  // `App.tsx`'s own `latestLoad` guards for its participant/store reads.
  const latestCall = useRef(0);

  useEffect(() => {
    const seq = ++latestCall.current;
    void api.getDemoState(SYSTEM_PARTICIPANT_ID).then(
      (initial) => {
        if (seq !== latestCall.current) return;
        setState(initial);
        // Only applied when the fetch finds a demo genuinely in flight - a
        // page load that lands on "idle" (nothing has run) or "finished"
        // (the last run's own last step) must not reach back and switch
        // the tab or acting participant away from what the app already
        // opened to.
        if (initial.status === "running" || initial.status === "paused") {
          applyStep(initial, onActingIdChange, onTabChange);
        }
      },
      (err: unknown) => {
        if (seq === latestCall.current) setError(err instanceof ApiError ? err.message : String(err));
      },
    );
    // Read once on mount only - `onActingIdChange`/`onTabChange` are stable
    // setters from `App.tsx`, and re-running this on every render would
    // re-fetch the same starting state without cause.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (state?.status !== "running") return;
    const interval = setInterval(() => {
      const seq = ++latestCall.current;
      void api
        .advanceDemo(SYSTEM_PARTICIPANT_ID)
        .then((next) => {
          if (seq !== latestCall.current) return;
          setState(next);
          applyStep(next, onActingIdChange, onTabChange);
        })
        .catch((err: unknown) => {
          if (seq === latestCall.current) setError(err instanceof ApiError ? err.message : String(err));
        });
    }, DEMO_STEP_MS);
    return () => clearInterval(interval);
  }, [state?.status, onActingIdChange, onTabChange]);

  // Every button funnels through here: it owns `busy`/`error` and the
  // sequence guard uniformly, so `perform` only has to decide what to fetch
  // and when a still-current response is worth setting state from
  // (`isCurrent`). One shared place for this, rather than each button
  // hand-rolling it, is what keeps a future button (or a future extra call
  // inside an existing one) from quietly missing the guard.
  const runAction = async (perform: (isCurrent: () => boolean) => Promise<void>) => {
    setBusy(true);
    setError(null);
    const seq = ++latestCall.current;
    const isCurrent = () => seq === latestCall.current;
    try {
      await perform(isCurrent);
    } catch (err) {
      if (isCurrent()) setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      if (isCurrent()) setBusy(false);
    }
  };

  const pauseOrResume = (call: (actor: string) => Promise<DemoState>) =>
    runAction(async (isCurrent) => {
      const next = await call(SYSTEM_PARTICIPANT_ID);
      if (isCurrent()) setState(next);
    });

  // Runs the first step immediately rather than waiting for the interval's
  // first tick (#94 follow-up: a presenter who clicks Start needs something
  // on screen right away, not an empty tab for one whole pacing interval).
  // The interval effect above takes over from step 2 onward, the instant
  // `state.status` becomes "running". `state` is set as soon as `startDemo`
  // itself resolves, before the immediate `advanceDemo` call - if that
  // second call fails, the UI still reflects the server's true "running"
  // status (Pause and Reset enabled, Start disabled) instead of getting
  // stuck showing a stale "idle" that a retried Start would only have the
  // server refuse.
  const start = () =>
    runAction(async (isCurrent) => {
      const started = await api.startDemo(SYSTEM_PARTICIPANT_ID);
      if (!isCurrent()) return;
      setState(started);
      const next = await api.advanceDemo(SYSTEM_PARTICIPANT_ID);
      if (!isCurrent()) return;
      setState(next);
      applyStep(next, onActingIdChange, onTabChange);
    });

  const reset = () =>
    runAction(async (isCurrent) => {
      const next = await api.resetDemo(SYSTEM_PARTICIPANT_ID);
      if (!isCurrent()) return;
      setState(next);
      onActingIdChange(SYSTEM_PARTICIPANT_ID);
      onTabChange("submit");
      onReset();
    });

  const status = state?.status ?? "idle";

  return (
    <section aria-labelledby="demo-player-heading" className="demo-player" data-testid="demo-player">
      <h2 id="demo-player-heading">Scripted demo</h2>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="demo-player-controls">
        <button type="button" onClick={() => void start()} disabled={busy || status !== "idle"} data-testid="demo-start">
          Start
        </button>
        <button
          type="button"
          onClick={() => void pauseOrResume(api.pauseDemo)}
          disabled={busy || status !== "running"}
          data-testid="demo-pause"
        >
          Pause
        </button>
        <button
          type="button"
          onClick={() => void pauseOrResume(api.resumeDemo)}
          disabled={busy || status !== "paused"}
          data-testid="demo-continue"
        >
          Continue
        </button>
        <button type="button" onClick={() => void reset()} disabled={busy} data-testid="demo-reset">
          Reset
        </button>
        <span className="badge" data-testid="demo-status">
          {status}
          {state ? ` (${Math.min(state.stepIndex, state.totalSteps)}/${state.totalSteps})` : ""}
        </span>
      </div>
      {/* The one thing this whole component exists to show: what the step
          that just ran means, right beside the tab content it changed
          (`App.tsx`'s sidebar), not scrolled away above it. Styled apart
          from `.hint`'s muted, secondary text - this is the story, not a
          footnote. */}
      {state?.current ? (
        <p className="demo-narration" data-testid="demo-narration">
          {state.current.narration}
        </p>
      ) : (
        <p className="hint" data-testid="demo-narration-placeholder">
          {status === "idle"
            ? "Click Start to play a scripted authorization through the relay."
            : "Reading…"}
        </p>
      )}
    </section>
  );
}
