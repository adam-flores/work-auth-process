# BDR-0001: The prototype preserves today's approval flow and rebuilds the experience around it

**Status:** provisional
**Date:** 2026-09-10
**Decided by:** us, provisionally

## Decision

The prototype models the current work authorization flow **exactly as it stands** — the same
steps, in the same order, with the same sign-offs. Every improvement comes from the tooling
built around that flow, not from changing it.

There is no second version. We do not build a digitized copy of today's experience to contrast
against a redesigned one; the current process stays a written document
(`docs/process/work-authorization-flow.md`), not a demo.

The prototype is not evidence that the approach works. Its job is to make the capability
concrete enough to justify a funded pilot, and the pilot is what produces the data.

## Why this, and not the alternatives

Three options were on the table.

**Mirror today's process.** Rejected on its own, because it improves nothing — but the half of
it that matters survived. Preserving the approval sequence means no control changes, so nobody
has to re-approve the controls themselves. In a business whose authorizations touch cost
allocation between legal entities and foreign restricted government contracts, that is a real
advantage rather than a compromise.

**Redesign the flow.** Rejected. Removing or parallelizing approvals makes the prototype a
proposal about how the business should govern itself, which is a much harder thing to get
agreement on and not where the problem actually lives.

**Build both and contrast them.** Rejected. It doubles the build to produce a comparison that
would not survive scrutiny anyway — see *What it assumes* below.

The decisive argument was that the original framing of the problem was wrong. We had assumed
the delay was the *sequence*: six approvals in a row, so the only way to save time is to have
fewer of them. It isn't. The time is lost **inside** the steps, not in the number of them:

- A form sits unnoticed because the approver does not know it is waiting.
- A form comes back because a field was wrong, and the loop starts again.
- An approver handles authorizations one at a time as they arrive, paying a context switch for
  each, rather than working a queue in one sitting.

None of those require touching a sign-off to fix. That is what the product attacks:

| Capability | What it fixes |
|---|---|
| Digital form with field validation | Errors caught at entry instead of downstream |
| Derived and pre-populated fields | The nine fields currently read off a picture of an org chart |
| Queue position visible to **all** parties | The originator can see where their form is without asking |
| Per-role dashboards over a batch of work | Approvers work a queue, not a stream of interruptions |

Ranked by weight: fewer mistakes first, less waiting second, less effort per form third.

## What it assumes

**That most of today's elapsed time is idle time and rework, not work.** This is the load-bearing
assumption and the weakest joint in the argument. With the approval sequence deliberately
unchanged, the entire cycle-time target has to come from forms that stop sitting unnoticed and
forms that stop coming back. If the six steps are genuinely busy end to end, the target is
unreachable and the decision to leave the flow alone was wrong.

**That the flow document is accurate.** It was transcribed by hand and carries four unresolved
discrepancies, recorded in that document.

**That a prototype with entirely mocked participants cannot demonstrate improvement.** Elapsed
time in a demo measures how fast the operator clicks. This is why the deliverable is framed as
earning a pilot rather than proving a result — and why the success targets below are goals we
set ourselves, not findings.

**That the sequence is parked, not settled.** The product owner may well want a better workflow,
and both things can be true: improve the path through the process now, redesign the process
later. The lifecycle work must therefore keep the sequence swappable rather than hard-coded.

## Question for the product owner

Three, in priority order.

1. When an authorization takes a long time today, where does the time actually go — approvers
   working through it, or the form sitting somewhere waiting to be noticed and forms coming
   back for correction? If it is genuinely the former, this decision is wrong.
2. Is preserving the existing sign-off sequence a requirement, a preference, or simply how it
   has always been? We have assumed changing it is expensive and unwelcome.
3. Would you rather see a tool that makes today's process work well, or a proposal for a
   different process? We have assumed the first.

## What changes if this is overturned

If the answer to question 1 is "approvers are genuinely busy," the cycle-time target goes with
it and the value proposition narrows to accuracy alone — survivable, but a smaller claim.

If the flow itself must change, the blast radius is larger: the lifecycle states, the routing,
and the dashboards all follow the sequence. This is why the sequence stays swappable. Overturning
it should cost a configuration change and a redraw of the flow document, not a rebuild.

The capabilities themselves — validation, derived fields, visibility, batch queues — survive
either answer. They are orthogonal to the routing, which is the main reason this decision is
safe to build on while provisional.
