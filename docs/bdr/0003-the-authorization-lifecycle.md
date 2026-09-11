# BDR-0003: Five explicit states, position derived, and four timestamps at every stage

**Status:** provisional
**Date:** 2026-09-11
**Decided by:** us, provisionally

## Decision

**An authorization has five explicit states. Where it is in the relay is not one of them.**
**Draft**, **On hold**, **Completed**, **Withdrawn**, and **Rejected** are recorded. While an
authorization is moving normally, its position is *read from* the relay — the stage it sits at,
plus whether that stage is awaiting action, has returned it for correction, or is a re-review.
There is no `in_review` status for anyone to maintain or forget to update.

**A denial and a rejection are different acts.** A **denial** concerns something *fixable*: it
returns to the submitter, who corrects and resubmits, and that loop is the only appeal there
is. A **rejection** concerns *the merits of the ask* and is terminal — there is no path back
out of it, and an authorization rejected in error is reopened by raising a new one. Where
practitioners actually draw that line is the first question below.

**The performing entity is a department, not a person.** An authorization arriving there lands
in a department queue where anyone may **claim** it; claiming is what names the performing
contributor. A submitter may optionally name a performing-side contact, which adds a
notification but does not remove the authorization from the department queue — the queue stays
authoritative, and it distinguishes claimed from unclaimed.

**Every stage records four timestamps** — `arrived`, `notified`, `acknowledged`, `resolved` —
which yield time-to-notify, notification-to-acknowledgement, acknowledgement-to-resolution, and
total time in the stage. **Acknowledgement** is an approver first opening the authorization,
and it is what separates *sat unopened* from *opened and under consideration*.

**A gate that does not apply is recorded as skipped**, carrying the value that decided it, not
silently omitted.

**A draft is fully visible** — in its submitter's queue and on the master dashboard like
anything else. Its submitter may delete it, and the system deletes it two weeks after it was
last modified.

The full transition table and the vocabulary are in [`CONTEXT.md`](../../CONTEXT.md). How this
is represented and routed is [ADR-0004](../adr/0004-transition-log-and-global-relay-config.md).

## Why this, and not the alternatives

**A status field carrying every state.** Rejected. `draft | in_review | denied | complete` is
the obvious model and it fails on the thing this ticket exists for: it cannot answer *when did
this arrive at performing finance, and when did they act*. That pair is the whole of M2, and
it is what the queue is a projection of. Deriving position from the relay also means adding a
gate adds no new state names — which is what keeps the
[BDR-0001](0001-preserve-the-flow-rebuild-the-experience.md) promise that resequencing costs a
configuration edit.

**One wait, arrival to action.** Seriously considered and rejected, with a cost accepted.
[BDR-0002](0002-the-cast-and-what-each-role-needs.md) settled notification on arrival, which
collapses *the approver did not know* to roughly nothing. What remains is *the approver knew
and did not act* — a capacity or priority problem that no tooling fixes. Measuring one interval
would leave the project unable to tell the two apart, and therefore unable to show which one
the pilot is actually looking at. The accepted cost is that acknowledgement time makes
individual approvers measurable on responsiveness. That is a political fact about an
organization, not a technical one, and it is the third question below.

**Appeal as a distinct action against a rejection.** Proposed and killed. It needs an
adjudicator the process has no role for, and a path out of a terminal state — which would make
Rejected not terminal and undo the distinction it exists to draw. A denial already *is* the
appeal route for anything fixable.

**Routing an authorization to a named individual at the performing entity.** Rejected as the
standard path. It requires the requesting side to know another department's staffing, and a
wrong guess strands the authorization behind someone on leave. Kept as an optional
notification, so the submitter's knowledge is used without being load-bearing.

**Ageing drafts off the master dashboard rather than deleting them.** Rejected. It needs an age
threshold to keep them visible for, which is the same fabricated number the map already ruled
out for staleness escalation. Deletion is cleaner: before initiation nothing has been asked of
anyone and no one has acted, so there is no audit trail to preserve. The audit trail starts at
initiation.

## Relationship to BDR-0002

Refines it in one place and confirms it in another.

**Queue is redefined.** BDR-0002 gave a queue as what has *arrived at* a role. That excludes
two things this decision puts in a queue: your own unfinished draft, and an authorization
denied back to you. The rule generalises to **what is waiting on your action**, whatever put it
there. *Arrival* keeps its old job as the thing notification keys off.

**Open visibility is confirmed, not narrowed.** Drafts were the obvious candidate for an
exception and are not one — a half-filled draft is on the master dashboard like anything else.
BDR-0002's open-record model therefore has no carve-outs.

## What it assumes

**That a rejection on the merits genuinely happens.** The flow document shows no terminal
path — every authorization in it reaches a charge number. If in practice approvers only ever
return things for correction and a dead authorization is simply one nobody resubmits, then
Rejected is a state with no cause, and abandonment is the real terminal condition.

**That an approver opening an authorization is a meaningful signal.** Acknowledgement assumes
opening approximates starting work. An approver who opens everything each morning and acts
later makes the measure noise.

**That the performing entity has something a department queue can attach to.** The model
assumes an identifiable performing organization with members who can claim work, rather than
an authorization being handed to a specific named person by arrangement outside the form.

**That two weeks is a reasonable life for an untouched draft.** Supplied by the product owner
as a policy value, not derived from evidence. Recorded as a choice to confirm rather than a
measured threshold — no baseline exists for it and none is claimed.

**That nobody but the submitter needs to pause an authorization.** On hold is submitter-only in
both directions. If an approver or a program can legitimately suspend work, this is wrong.

## Question for the product owner

1. **What actually separates a denial from a rejection in your process?** We have modelled a
   denial as concerning something fixable and a rejection as concerning the merits of the ask.
   Do approvers today ever refuse an authorization outright, rather than returning it for
   correction — and if so, what makes them do one rather than the other?
2. **Is two weeks the right life for an untouched draft?** We chose it as a policy value with
   no evidence behind it, and it deletes the draft rather than archiving it.
3. **Is it acceptable in your organization to record when an individual approver first opens
   an authorization?** Separating *sat unopened* from *under consideration* only pays off if
   the answer is yes, and it makes approvers individually visible on responsiveness. If that
   would make the pilot harder to sell, we drop to a single arrival-to-action interval and the
   cycle-time claim gets correspondingly weaker.
4. **Can anyone other than the submitter pause an authorization** — an approver, a program
   manager, a finance lead?
5. **When work is sent to a performing department, is there a queue anyone there can pick from,
   or is it handed to a named person by prior arrangement?**

## What changes if this is overturned

**If rejection on the merits does not exist**, one state disappears and denial absorbs
everything. Small blast radius: the transition table loses a row and `CONTEXT.md` loses a term.
[#11](https://github.com/adam-flores/work-auth-process/issues/11) is where it would bite, since
it defines what happens on a return.

**If acknowledgement cannot be recorded**, the four timestamps become three and M2 can no longer
distinguish idle time from review time. The cycle-time argument survives but loses its
diagnosis — the pilot could show time was lost without showing where. Nothing else changes;
this is deliberately the cheapest thing here to remove.

**If the performing side is handed to a named person by arrangement**, the claim transition goes
away and the optional contact becomes mandatory routing. Moderate: it changes what stage 2's
arrival means and removes a timestamp pair.

**If position should be stored rather than derived**, everything here survives but
[ADR-0004](../adr/0004-transition-log-and-global-relay-config.md) is wrong. That is the point of
recording them separately.

**The five states and the four timestamps are safe to build on while provisional.** They are
independent of where a denial lands
([#11](https://github.com/adam-flores/work-auth-process/issues/11)) and of what gets counted
([#13](https://github.com/adam-flores/work-auth-process/issues/13)) — both of which are
downstream of this decision rather than inputs to it.
