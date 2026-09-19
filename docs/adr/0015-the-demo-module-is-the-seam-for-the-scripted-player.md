# The demo module is the seam for the scripted player

**Status:** accepted

[Issue #94](https://github.com/adam-flores/work-auth-process/issues/94) asks for a scripted demo
that plays itself - a fixed happy-path story, advanced one step at a time by a
Start/Pause/Continue/Reset control bar, reliable enough to repeat for more than one audience in a
three-minute in-person slot. This records the shape that makes it real, the same way
[ADR-0010](0010-the-service-module-is-the-seam.md) recorded the service module's.

**A new module, `src/demo/`, mirrors ADR-0010's split.** `src/demo/script.ts` holds the fixed,
ordered list of steps - each one names an acting participant, the service command to call, and
which tab the presenter's screen switches to - and `src/demo/index.ts` holds `createDemoRunner`, a
small state machine (`idle` / `running` / `paused` / `finished`, plus a step index) that plays it.
Every step calls a real function on the same `Service` the product's own HTTP layer calls -
`initiate` by way of `createDraft`/`addResource`/`initiateDraft`, `acknowledge`, `claim`,
`contribute`, `mintChargeNumber` - so the runner can never show a story the product cannot actually
produce. The script was originally happy-path-plus-correction; a first walkthrough (#94 follow-up)
found a correction request, its comment, and a resumed approval asked an audience to track more
than a three-minute demo affords, so it was cut back to the happy path alone - `requestCorrection`
and `correct` are no longer among the commands the script calls, though both remain fully exercised
at the service seam (`tests/service/correction.test.ts`) and in the fixture generator below. HTTP
holds no logic here either: `src/server/index.ts` adds six routes (`GET /api/demo`,
`POST /api/demo/{start,pause,resume,advance,reset}`), each one a direct call into the one
`DemoRunner` the server process holds.

**Advancing is client-paced; there is no server-side timer.** While `status` is `running`, the
browser calls `POST /api/demo/advance` on a fixed interval (`DemoPlayer.tsx`), and the server holds
the authoritative status and step index - a page refresh mid-demo asks the runner what is true
rather than losing its place. This is the same one-process, nothing-to-provision posture
[ADR-0008](0008-sqlite-for-the-prototype-store.md) and ADR-0010 already committed to: a websocket
or a server-side interval would be a second moving part for a three-minute demo that does not need
one. Pausing only ever flips `status` between polls - a step, once started by `advance`, always
finishes before the presenter's click can be observed, so pause never leaves the story mid-step.

**A single runner, not one per browser session or per participant.** `createDemoRunner` is called
once, alongside the one `Service` the server holds (`src/server/index.ts`), the same singleton
shape the service module already has. This is a presenter's tool for one demo at a time, not a
multi-user feature (#94's own stated scope) - there is deliberately no session key, no per-viewer
state, and no way to construct a second one from the HTTP surface.

**`Tabs.tsx` became a controlled component.** Before this, it held its own `activeId` state; the
demo player needs to switch tabs itself as the script requires (user story 5), which only works if
something outside the tab shell can set the active tab. `App.tsx` - `Tabs`' one caller - now owns
`activeTabId` and hands it down as a prop, alongside the acting-as switcher the demo player already
drove by calling `setActingId` the same way a presenter's own click would.

**Reset asks the store to clear process data too, which an ordinary reset deliberately does not.**
`resetStore` already existed (ADR-0011) and reseeds reference data - participants, hierarchy,
permissibility - back to the demo catalog; it leaves drafts and the transition log alone across a
reseed, a deliberate choice `tests/service/authorization-history-fixture.test.ts` documents and
`npm run reset` depends on (it layers `seedAuthorizationHistory` on top of a reseed rather than
replacing it). The demo player's Reset needs a genuinely clean slate before it lays anything of its
own down. Rather than a new service command, `resetStore` gained one optional argument -
`ReseedOptions.wipeProcessData` (`src/store/index.ts`) - defaulted to `false` so every existing
caller and every existing test is unaffected; the demo runner's `reset()` is the one caller that
passes `true`. This is the smallest change that gives Reset what it needs without touching the
header's own general-purpose "Reset the store" button, which keeps its current, tested, documented
behavior.

**Reset also seeds historical data - a reversal of this ADR's first version, refined twice.** The
original design deliberately left Reset at an empty queue and dashboard (user story 8: "everything
the audience sees was visibly created by the demo itself"). A first walkthrough showed the cost of
that purity: Insights and the master dashboard read as broken, not "not started yet," when every
measure is genuinely zero. The first fix reached for the fixture already at hand -
`seedAuthorizationHistory` (`src/fixtures/authorization-history.ts`, #65/ADR-0006), the same one
`npm run reset` layers on for local development - which worked, but at a real cost: that fixture
exists to cover every transition kind ADR-0006 names, so a couple of its own scenarios
(`seedOpenOnHold`, `seedFreshlyInitiated`) leave something genuinely open, landing back in the
exact "not created by the demo itself" clutter user story 8 was written against, and its mixed bag
of referrals, corrections, holds and revocations made M1-M3 harder to explain at a glance than they
needed to be.

The second round replaced it with a fixture built for this one purpose: `seedInsightsHistory`
(`src/demo/insights-history.ts`) seeds exactly five completed authorizations and nothing else - a
fixed spread of cycle times (3, 6, 7, 8, and 8 days, averaging 6.4) rather than a randomized one,
so the number Insights shows is a specific, reviewable, explainable one rather than whatever a
seeded PRNG happened to produce. Every one of the five is terminal, which resolves the tradeoff
the first round accepted: every queue is genuinely empty the instant Reset finishes, same as user
story 8 always asked. Both fixtures still seed through the same command surface a live user's
click would (ADR-0010) and end safely before "now", so the demo's own scripted authorization is
always the newest thing in the log once a run starts.

## Considered options

- **Fold the demo's steps into the service module itself**, as a `runDemoStep` command beside
  `initiate` and `acknowledge`. Rejected: the service module's whole claim (ADR-0010) is that it
  holds process decisions, and a demo script is not one - BDR-0003's lifecycle and BDR-0005's
  correction-in-place are unchanged by this issue, and mixing presentation orchestration into the
  seam that the fixture generator and every domain test also depend on would blur exactly the line
  ADR-0010 draws.

- **A server-side timer driving `advance` itself**, instead of client-paced polling. Rejected for
  the same reason ADR-0010 rejected a websocket: one more moving part than a three-minute,
  single-presenter demo needs, and it would mean the server keeps running a script nobody is
  watching if the browser tab closes mid-demo.

- **Give the demo its own copy of the store-reset logic**, wiping process data directly rather than
  extending `resetStore`. Rejected - it would duplicate the transaction and foreign-key-ordering
  care `seed()` already takes, and ADR-0010's discipline is that a mutation goes through the
  service, not around it; an optional flag on an existing command is smaller than a second path to
  the same tables.

## Consequences

**A demo run always sits on top of the same five completed authorizations, never a mix of two
runs' worth.** Reset wipes process data before reseeding, so repeating Start/.../Reset never
accumulates a second copy of the history or a leftover authorization from the previous script run
- each Reset is exactly `seedInsightsHistory`'s five authorizations and nothing else. What a
presenter's own scripted run adds is the only thing that was not there a moment before.

**The control bar's correctness is proven at the module seam, not through Playwright.** The full
script, pause/resume mid-story, and reset are exercised directly against `createDemoRunner`
(`tests/demo/runner.test.ts`, parallel to `tests/service/*.test.ts`), and `seedInsightsHistory`
itself against its own totals and cycle times (`tests/demo/insights-history.test.ts`) - the same
way ADR-0010 already argues test cost should be paid at the narrowest seam. Playwright
(`tests/e2e/`) only proves the four buttons produce visible change end to end - the step-by-step
logic itself does not depend on browser timing to be correct.
