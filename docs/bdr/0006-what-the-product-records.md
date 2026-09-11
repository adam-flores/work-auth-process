# BDR-0006: The product records the relay and nothing before it

**Status:** final
**Date:** 2026-09-11
**Decided by:** product owner
**Supersedes:** [BDR-0003](0003-the-authorization-lifecycle.md) in part — the `acknowledged`
timestamp

## Decision

The prototype does not demonstrate improvement; it earns a funded pilot, and the pilot produces
the baselines sitting at `TBD` throughout [`docs/business-case.md`](../business-case.md) §7. So
the question is not what the demo shows but what the product must **record while it runs** so
those numbers are computable later.

**Measurement begins at initiation.** Cycle time runs from the moment a submitter releases a
draft into the relay to the moment a charge number completes it. Time spent in draft is not
measured, and a draft abandoned or deleted leaves no trace of any kind. The product therefore
records **nothing at all about the form-filling experience** — a deliberate choice, and the one
with the largest consequence here. See *What it assumes*.

**Three timestamps per stage, not four.** `arrived`, `notified`, `resolved`. BDR-0003's fourth —
`acknowledged`, an approver first opening the authorization — is removed: the product owner
ruled that time in queue per stage is sufficient, and separately that opening an authorization
does not reliably mean work has started on it. The signal lost its permission and its meaning at
once. `notified` is kept but is not a measure: arrived-to-notified should be near zero, and if it
ever isn't, notification-on-arrival is broken and nothing else in the system would say so.

**Time on hold is excluded from cycle time and reported separately.** Only the submitter holds
and only the submitter releases, so held time charges approvers for a pause nobody was waiting
through. This is not the exclusion
[BDR-0005](0005-correction-in-place-and-revocation.md) refused: time *awaiting correction* stays
in the stage's clock, because a correction is the process failing while somebody waits. A hold is
the submitter deliberately stopping it. Reporting held time separately is what keeps the
distinction honest — if holds start absorbing delay that should have been a correction request,
the number says so.

**A re-entered stage is separate occurrences, not one total.** A re-review means the rules or the
data moved beneath a stage that had already resolved ([ADR-0005](../adr/0005-field-dependencies-drive-re-review.md)).
A stage's reported time is its **first-pass occurrence**; re-review time is a separate line. Folding
them together would make a stage look slow for something BDR-0005 explicitly establishes nobody
did wrong. End-to-end cycle time still includes every occurrence, so the total stays honest while
the attribution stays fair.

**What counts as an error is unchanged**, settled by
[BDR-0005](0005-correction-in-place-and-revocation.md): a **correction request** at a stage is
counted; a **validation failure at entry** is reported separately as a prevention; a **re-review**
and a **revocation** are not errors.

**M4, M5 and M6 are gathered by the pilot, not by the product.** SME interactions, forms completed
without SME contact, and time-to-competence all describe a submitter going to find an expert.
A hallway conversation is invisible to software. Counting when a submitter opens a field's written
guidance was offered as the one honest proxy available and **declined** — not tracking at that
level for a prototype. These three measures are therefore survey items during the pilot, and §7
now says so rather than implying the product will supply them.

**A record of who an authorization passed between *within* a stage is collected, visible in
history, and excluded from every measure.** Volunteered by the product owner and unusual enough to
state explicitly: recorded for reconstruction, never reported on. What such a handoff *is* — who
may do it, whose queue it sits in meanwhile, whether the sign-off then comes from someone other
than the person the stage routed to — is not modelled and is
[#37](https://github.com/adam-flores/work-auth-process/issues/37)'s.

**An insights dashboard presents the measures**, admin-only, over seeded historical data. The
prototype is pre-pilot and has no real history, so the screen is shown for what it *could* show.
The shape is [ADR-0006](../adr/0006-insights-from-seeded-transition-history.md).

### What M2 can and cannot say

Worth stating plainly, because §7 previously claimed more. A stage's elapsed time decomposes into
**time the approver held it** and **time it was out for correction**. Worked through: the stage-4
approver spots a wrong department on day 2, requests a correction, the fix lands on day 6, they
acknowledge on day 7. Stage 4 reports seven days — four out for correction, three held.

So the pilot can show **which stage** the time accumulated in, and **how much of it was the data
being wrong**. It cannot show whether those three days were an approver considering the
authorization or an authorization sitting unopened. That distinction died with `acknowledged`, and
`docs/business-case.md` §7 has been reworded to claim only what is evidenced. The 50% target is
untouched; what is gone is the ability to explain *why* it moved.

## Why this, and not the alternatives

**Starting the clock at draft creation.** Argued for and rejected by the product owner. The case
for it is that the project's stated failure mode is a submitter who cannot work out the form, and
that time is entirely pre-initiation — so a 50% relay reduction could coexist with submitters
taking just as long to get a draft out the door, and the headline measure would not notice.
Rejected as more instrumentation than a prototype needs. The cost is recorded above rather than
argued again.

**Counting abandoned drafts.** Proposed as a cheap and strong pilot argument — *n submitters
started and gave up* is the failure this project exists to remove, and it costs one record at
deletion. Declined for the same reason. It means deletion stays total, which is the simpler
promise.

**Counting guidance opens as a proxy for M4/M5.** The last remaining candidate for measuring the
form-filling experience, and declined. Worth recording that it was refused on prototype scope
rather than on honesty grounds — it was never proposed as a substitute for M4 or M5, only as a
separately-named signal, and the by-field breakdown would have shown which fields are hard. If the
pilot needs it, it is cheap to add and changes nothing else here.

**Pausing the clock during a correction.** Already rejected by
[BDR-0005](0005-correction-in-place-and-revocation.md) on the grounds that it makes cycle time look
best precisely when the process performed worst. Restated here only because excluding held time
looks like the same move and is not.

**One undifferentiated stage total, re-reviews folded in.** Simpler, and wrong in the direction
that matters: it charges a stage for the relay's configuration changing under it.

**Hardcoding the insights dashboard's figures.** Rejected — see
[ADR-0006](../adr/0006-insights-from-seeded-transition-history.md).

## What it assumes

**That the pre-initiation experience does not need measuring.** This is the load-bearing
assumption and the one most likely to be challenged. `docs/business-case.md` §3 rests on knowledge
access being the failure mode; §7 targets a 25% reduction in errors and a 50% reduction in cycle
time, both of which are now measured strictly downstream of the submitter pressing initiate. If a
reviewer asks how we know the guidance helped, the honest answer is that the product does not
know and the pilot survey does.

**That a stage's approver and its queue are the right unit to attribute time to.** Carried over
from [BDR-0005](0005-correction-in-place-and-revocation.md), which charges correction time to the
stage that found the defect rather than to whoever entered the bad data.

**That holds are rare and honest.** Excluding held time is safe only if holding is what
`CONTEXT.md` says it is — a submitter pausing their own request. If a hold becomes the informal way
an approver parks something, the exclusion hides exactly the delay the pilot is looking for. The
separate held-time report is the check on this, not a decoration.

**That an admin audience for the insights dashboard is meaningful.** The prototype has no
authentication ([`docs/business-case.md`](../business-case.md), and the map rules it out of
scope), and every previous decision made visibility open — BDR-0002 settled the master dashboard as
readable by anyone and BDR-0003 confirmed the open-record model has no carve-outs. Admin-only is
therefore a stated intent rather than an enforced boundary in what gets built, and it is the first
restricted surface in the system.

**That volume and rework-rate baselines will exist by the pilot.** The measures defined here are
ratios and intervals. Authorizations raised per month and the share coming back for correction are
still `TBD` and the product owner did not have them; they are in the second round of questions
([#32](https://github.com/adam-flores/work-auth-process/issues/32)).

## What changes if this is overturned

**If pre-initiation time has to be measured after all**, a draft gains a creation timestamp on the
record and an abandonment count at deletion. Small — two values and one report — but it reopens
BDR-0003's rule that the audit trail starts at initiation, and the honest framing is that we chose
not to look rather than could not.

**If held time should count**, one line changes in how M2 sums. Trivial, and reversible either way
because the interval is recorded regardless of whether the headline includes it. This is the
cheapest thing here to change your mind about.

**If `acknowledged` comes back** — a different organization, or a pilot where approvers agree to
it — M2 regains the idle-versus-busy diagnosis and §7's original argument returns. Nothing built
here obstructs it: the transition log takes a fourth stamp without reshaping.

**If re-reviews should fold into one stage total**, the attribution changes but no recording does.
Both readings are computable from the same log, which is why this is a reporting decision rather
than a schema one.

**If the insights dashboard needs real access control**, authentication comes back into scope for
the prototype, which the map currently rules out. That is the largest blast radius here and the
least likely to fire.
