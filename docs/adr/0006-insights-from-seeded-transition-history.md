# The insights dashboard folds a seeded transition log, and does not display figures

**Status:** accepted

[BDR-0006](../bdr/0006-what-the-product-records.md) settles what the product records so a pilot
can compute the measures, and puts those measures on an **insights dashboard** for admins. The
prototype is pre-pilot: it has no real history, and the product owner's direction is to mock
historical data so the screen can show what it *could* show. This records how.

**The dashboard computes every figure as a fold over the transition log**, the same fold
[ADR-0004](0004-transition-log-and-global-relay-config.md) already uses to derive an
authorization's current position. No number on the screen is written by hand.

**The mocked history is a seeded set of authorizations with full transition logs**, generated at
fixture time: initiations, arrivals, notifications, correction requests, re-reviews, holds,
revocations and mints, spread over a plausible period with plausible intervals. The demo's own
clicking appends to the same log, so a walkthrough moves the numbers.

**The seed is synthetic and obviously so**, per this repository's rule against real operational
data. Departments, submitters and concerns come from the same fictional vocabulary as the rest of
the fixtures.

## Considered options

- **Hardcoding the dashboard's figures.** Cheaper by a wide margin and it makes the screen look
  identical. Rejected because it proves nothing: the entire argument of
  [BDR-0006](../bdr/0006-what-the-product-records.md) is that the product records enough for a
  pilot to compute these later, and a hardcoded chart demonstrates that the chart renders, not
  that the instrumentation exists. A fold over seeded transitions is the only version where the
  screen being right *is* evidence that the recording is right. It also means a gap in what we
  record shows up as a figure that cannot be produced, during the build rather than during the
  pilot.

- **Seeding computed aggregates rather than raw transitions.** The middle path: store per-stage
  totals directly and skip generating the events underneath. Rejected for the same reason one step
  removed — it tests the presentation and skips the derivation, which is where the definitions in
  BDR-0006 actually live. It would also let a seeded aggregate disagree with a live one and give
  nothing that notices.

- **Running the demo against an empty log and showing the dashboard blank until clicked.** Honest,
  and useless as an argument. Cycle time is measured in days; a demo is measured in minutes. The
  value this product claims accrues over a period no demo can span, which is exactly why seeded
  history exists.

## Consequences

**A fixture generator becomes a real artifact**, not a throwaway. It has to produce transition
sequences that are *valid* — no acknowledgement before an arrival, no correction outside a stage,
no mint before the last stage resolves — because an invalid sequence folds into a nonsense figure.
In practice that means the generator uses the same relay configuration the product routes against,
rather than a second description of the process that can drift from it.

**Admin-only is a stated audience, not an enforced boundary.** The map rules authentication out of
scope and every participant is mocked. The dashboard is reachable by whoever runs the prototype;
the restriction is recorded as intent for a real build.
[BDR-0006](../bdr/0006-what-the-product-records.md) carries this as an assumption, since it is the
first restricted surface in a system whose every other view is deliberately open.

**Measure definitions have exactly one implementation.** Time in queue, time awaiting correction,
held time excluded, first-pass occurrence separated from re-review — each is written once as a
fold and used by both the dashboard and anything a pilot exports. A second implementation for
reporting is the failure this avoids.

**Reading costs a fold over a larger log than ADR-0004 anticipated.** Seeded history is the point,
so the log is bigger than live demo use would make it. Unchanged answer: acceptable at prototype
volumes, and if it stops being acceptable the fix is a cached projection rebuilt from the log, not
a maintained aggregate table.

**This tightens [ADR-0003](0003-data-store-xml-or-sqlite.md) further without deciding it.**
Aggregate queries over a few thousand seeded transitions are comfortably within both candidates.
That ADR stays open.
