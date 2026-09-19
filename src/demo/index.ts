import type { Service } from "../service/index.ts";
import { SYSTEM_PARTICIPANT_ID } from "../shared/constants.ts";
import { DomainError } from "../service/errors.ts";
import { seedInsightsHistory } from "./insights-history.ts";
import { buildDemoScript, createDemoContext } from "./script.ts";
import type { DemoContext, DemoStep } from "./script.ts";

/**
 * The demo module (#94): the seam for the scripted demo player, mirroring
 * ADR-0010's shape for the product's own service module. A small, fixed
 * state machine plays `buildDemoScript()` one step at a time, driving the
 * same service functions a live user would - the runner can never show a
 * story the product cannot actually produce.
 *
 * Advancing is client-paced (`advance`): while `status` is "running", the
 * browser calls this on a fixed interval, and this module holds the
 * authoritative status and step index, not the browser. A page refresh mid
 * demo asks this module what is true rather than losing its place. There is
 * no server-side timer or websocket - a step only ever happens inside a call
 * to `advance`.
 *
 * A single instance is created once, alongside the one `Service` the server
 * process holds (`src/server/index.ts`) - this is a presenter's tool for one
 * demo at a time, not a multi-user feature, so there is deliberately no way
 * to construct more than the caller asks for.
 */

export type DemoStatus = "idle" | "running" | "paused" | "finished";

/** What the presenter's screen needs about the step that just ran, so it can
 *  switch tab and acting participant to match (#94: "automatically switch
 *  tabs and switch 'acting as' as the story requires"). `null` before the
 *  first step has run. */
export type DemoStepSummary = {
  index: number;
  tabId: string;
  actingId: string;
  narration: string;
};

export type DemoState = {
  status: DemoStatus;
  /** The index of the next step `advance` will run, from 0 to `totalSteps`
   *  inclusive - `totalSteps` once `status` is "finished". */
  stepIndex: number;
  totalSteps: number;
  authorizationId: string | null;
  current: DemoStepSummary | null;
};

function summarize(step: DemoStep, index: number): DemoStepSummary {
  return { index, tabId: step.tabId, actingId: step.actingId, narration: step.narration };
}

export function createDemoRunner(service: Service) {
  const steps = buildDemoScript();
  let status: DemoStatus = "idle";
  let stepIndex = 0;
  let ctx: DemoContext = createDemoContext();
  let current: DemoStepSummary | null = null;

  function state(): DemoState {
    return {
      status,
      stepIndex,
      totalSteps: steps.length,
      authorizationId: ctx.authorizationId,
      current,
    };
  }

  return {
    getState: state,

    /** Begins a run from a clean start. Only valid while idle - already
     *  running or paused mid-story is refused rather than silently
     *  restarted, and a finished run is only ever returned to idle by
     *  `reset` (#94: Reset is what returns to a known starting point). */
    start(): DemoState {
      if (status !== "idle") {
        throw new DomainError("DEMO_NOT_IDLE", "The demo is already running, paused, or finished - reset it first.");
      }
      status = "running";
      return state();
    },

    /** Stops advancing between steps, never mid-step - `advance` is the only
     *  thing that ever runs a step, and this only ever flips `status`. */
    pause(): DemoState {
      if (status !== "running") {
        throw new DomainError("DEMO_NOT_RUNNING", "The demo is not running.");
      }
      status = "paused";
      return state();
    },

    /** Resumes exactly where `pause` left it - `stepIndex` and `ctx` are
     *  untouched by pausing, so the next `advance` runs the same step it
     *  would have run had pause never happened. */
    resume(): DemoState {
      if (status !== "paused") {
        throw new DomainError("DEMO_NOT_PAUSED", "The demo is not paused.");
      }
      status = "running";
      return state();
    },

    /**
     * Runs exactly one step, called by the browser on its own fixed
     * interval while `status` is "running" (#94: client-paced advancing). A
     * no-op, not an error, whenever nothing should happen right now -
     * idle, paused, or finished - since the poller has no reliable way to
     * know `status` changed between reading it and calling this. A step
     * that throws leaves `stepIndex` and `current` untouched, so the failed
     * step - never expected outside a broken script - is what a retry would
     * repeat rather than the one after it.
     */
    advance(): DemoState {
      if (status !== "running") return state();
      if (stepIndex >= steps.length) {
        status = "finished";
        return state();
      }
      const step = steps[stepIndex]!;
      step.run(service, ctx);
      current = summarize(step, stepIndex);
      stepIndex += 1;
      if (stepIndex >= steps.length) status = "finished";
      return state();
    },

    /**
     * Returns the store and the runner both to a known starting point
     * (#94), so the same demo can run again for a second audience. Reseeds
     * from the demo catalog (hierarchy and participants only, #92), asks
     * for process data to be wiped too (`ReseedOptions.wipeProcessData`,
     * `src/store/index.ts`) - unlike the header's own general-purpose
     * "Reset the store" button, this reset needs a genuinely clean slate,
     * not carrying whatever an earlier run of the same script left behind
     * - and then seeds `seedInsightsHistory` (`./insights-history.ts`): five
     * completed authorizations with a fixed spread of cycle times, built
     * specifically so Insights has something to show the moment a
     * presenter opens the app, rather than every measure reading zero
     * (#94 follow-up). Every one of the five is terminal, so this leaves
     * every queue genuinely empty, same as before any history existed -
     * unlike the general-purpose fixture `npm run reset` seeds
     * (`seedAuthorizationHistory`, #65/ADR-0006), which this module
     * deliberately does not use: that fixture's own open-on-hold and
     * freshly-initiated scenarios are exactly the kind of "not created by
     * the demo itself" clutter user story 8 asks Reset to avoid. Built to
     * end safely before "now", so the demo's own scripted authorization is
     * always the newest thing in the log once a run starts.
     *
     * Valid from any status, including mid-run: a presenter can always
     * start over. The runner's own fields are set back to idle *before*
     * either store call, not after - `resetStore` and
     * `seedInsightsHistory` are dozens of service calls between them, and a
     * failure partway through one (unexpected, but reachable the moment
     * either ever changes) must not leave this runner believing it is
     * still running or paused against an authorization the store no
     * longer has. Idle-with-no-authorization is always a safe state to be
     * in - if the store calls below throw, the error still reaches the
     * caller, but the next `advance` or `start` finds a runner ready to
     * try again rather than one wedged mid-script.
     */
    reset(): DemoState {
      status = "idle";
      stepIndex = 0;
      ctx = createDemoContext();
      current = null;
      service.resetStore({ participantId: SYSTEM_PARTICIPANT_ID }, { wipeProcessData: true });
      seedInsightsHistory(service);
      return state();
    },
  };
}

export type DemoRunner = ReturnType<typeof createDemoRunner>;
