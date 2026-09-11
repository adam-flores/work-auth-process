# BDR-0002: The cast is three roles, the queue is scoped, and the record is open

**Status:** provisional
**Date:** 2026-09-11
**Decided by:** us, provisionally

## Decision

**Three roles, not ten.** The ten participant names in
[the flow document](../process/work-authorization-flow.md) collapse to **Contributor**,
**Approver**, and **Charge Number Admin**, distinguished by what they can *do*. What they are
*accountable for* is a **concern** — scope, funds available, cost estimate, contract terms,
export — which identifies a stage without multiplying roles. **Submitter** is not a fourth
role but a relationship to one authorization: the individual who created it and owns it for
life. The vocabulary is in [`CONTEXT.md`](../../CONTEXT.md).

**Visibility splits by surface.** A **queue** is scoped and arrival-only: an authorization
appears when it reaches you, shows what you need to act on it, and leaves when you act. A
**master dashboard** is open and complete: every authorization, visible to anyone with access,
filterable, and the only place history is retrieved. Push is scoped; pull is open.

**What each role needs is not a settlement between competing interests but explicit, uniform
criteria.** The role that judges a field owns that field's **criteria** and its **field
guidance**, authored by the people accountable for the judgement rather than by whoever builds
the form.

## Why this, and not the alternatives

**Ten roles, kept distinct.** Rejected. Eight of the ten can do exactly the same thing — open
an authorization and accept or deny it. What separates a finance approver from a program
manager is which part they scrutinise, and that is better held as an attribute of a stage than
as a role of its own. Keeping ten would mean a new role type every time the business adds a
reviewer, and a routing table written in bespoke names.

**Strict need-to-know visibility.** Seriously held and then abandoned. The first model was that
a participant sees an authorization only once it reaches them, and only the fields they need.
It collapsed on a single fact: the labor figures on the form are **average** rates, not actual
compensation. With nothing proprietary on the record, restricting who may read it buys no
protection and costs the process its memory — an approver could not answer what they approved
last quarter, and the submitter became the only person able to chase anything. What survives
from that model is the good half: the queue still shows you only your step, because an approver
should not have to read a whole record to judge one part of it.

**A Follower role.** Proposed to give the assigned engineer visibility, then killed by the
decision above. Once any record is readable by anyone, a role whose only power is read access
grants nothing. The engineer filters the master dashboard by their own name.

**Balancing competing interests.** Rejected as the wrong frame. We first mapped where the roles
pull against each other — submitter wanting speed, gates having no stake in the work happening,
the final clerical step held by the party with least reason to hurry. That reads well and
designs badly. The defect is not that approvers want different things; it is that each applies
a slightly different **unwritten** lens to the same field, so a form that satisfies one reviewer
fails the next for reasons nobody recorded. Uniformity is the fix, and it is why criteria and
guidance are owned by the judging role rather than written once by a form designer.

## Relationship to BDR-0001

Refines it; does not overturn it.
[BDR-0001](0001-preserve-the-flow-rebuild-the-experience.md) committed to "queue position
visible to all parties, not only to whoever's turn it is." This goes further than that promise
rather than short of it: the whole record is visible to everyone, not merely its position, and
not merely to parties. Its second capability — per-role dashboards over a batch of work — is
preserved exactly. The queue *is* that dashboard.

One BDR-0001 capability is deliberately narrowed: an approver cannot see what is heading toward
them, only what has arrived. No forecast view exists, and the only participant who can chase a
stalled authorization is its submitter.

**Escalation on age is deferred, not rejected.** A stale authorization generating a second nudge
needs a threshold, and no baseline exists to set one from — `BUSINESS_CASE_V2.md` §7 is `TBD`
throughout. Inventing one would break this project's own rule against fabricated numbers. It
belongs after the pilot produces real timings.

## What it assumes

**That the labor figures are averages, not actuals.** This is the load-bearing assumption and
the whole of open access rests on it. If actual compensation ever appears on an authorization,
the master dashboard as specified is wrong.

**That nothing else on an authorization is sensitive between entities.** Cost allocation between
legal entities is precisely the kind of thing business units can be guarded about, and this
decision assumes they are not.

**That the requesting finance approver checks funds against something held outside this
process.** The flow has them approving a budget at stage 1, but budget hours and labor rate are
entered by the performing side at stage 2 — so at their step there is no budget on the form yet.
Recorded as discrepancy 5 in the flow document.

**That the assigned engineer genuinely takes no action.** They are a field value on the form,
not a participant, and the product gives them nothing but a filter on the master dashboard.

**That approvers will write down what they check for, and keep it current.** The business case's
own root-cause framing is that this knowledge lives in people. Criteria ownership assumes those
people will externalise it and maintain it — which is a behavioural bet, not a technical one.

## Question for the product owner

1. **Are the labor figures on the form average rates or actual compensation? And is there
   anything on an authorization that one entity would not want another to read?** Every record
   being visible to everyone depends on both answers, and it is the easiest thing here to get
   wrong.
2. **What does the requesting finance approver actually approve?** The hours and rate arrive
   later, from the other side, so they appear to be approving a budget that does not exist yet.
   We have assumed they are confirming funds against a portfolio held outside this process.
3. **When an approver denies a form today, do they give a written reason, and does it reliably
   reach the person who submitted it?** We have assumed a comment is mandatory on denial.
4. **Would your approvers write down what they check for, and keep it up to date?** If not, the
   consistency argument has no mechanism behind it.
5. **Is the employee assigned to the work ever involved before the charge number exists?** We
   have assumed not.

## What changes if this is overturned

**If the rates are actuals, or something is entity-sensitive**, the master dashboard is wrong
and visibility reverts to need-to-know: scoped reads, and a Follower-style grant so the people
who need ongoing sight of an authorization can get it. Moderate blast radius — queue behaviour
is unaffected, and the three roles survive untouched.

**If three roles prove too few**, adding one is cheap. The expensive part would be the stage
model, since a role that cannot be told apart by capability is the thing `concern` exists to
handle.

**If criteria ownership is rejected**, field validation survives but the guidance has to be
authored centrally, and the key-person dependency the business case names moves rather than
dissolves. That question is [#12](https://github.com/adam-flores/work-auth-process/issues/12).

**The three roles and the queue/dashboard split are safe to build on while provisional.** They
are orthogonal to routing, which is what makes them stable regardless of how the lifecycle
question settles.
