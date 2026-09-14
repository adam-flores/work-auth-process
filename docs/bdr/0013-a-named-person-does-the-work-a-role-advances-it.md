# BDR-0013: A named person is required for the work to be done, not for it to advance

**Status:** final
**Date:** 2026-09-14
**Decided by:** product owner

## Decision

**The program manager and the finance approver are named on the authorization, on both sides, and
both are required.** The source form collects them and the product keeps them.

**Naming them does not make them the route.** A **stage** still routes to a **role at a
department**, every holder of that role sees it, and any of them may **acknowledge** — exactly as
[BDR-0011](0011-a-referral-shows-it-without-moving-it.md) has it. The named individuals are who the
work belongs to; they are not a gate on the relay advancing.

The product owner's answer draws the line in one stroke. The department is what must be named. A
named individual is needed so the work has an owner — not so the relay can take a step.

**This reverses a proposal, not a record.** An earlier draft of the build spec proposed dropping
both fields on the grounds that naming an individual approver contradicted role-routing. It does
not. The two answer different questions — *who is accountable for this work* and *who may sign it
forward* — and the source form was collecting the first while we read it as the second.

## Why this, and not the alternatives

**Drop both fields entirely.** What the spec proposed. Its appeal was consistency: if a stage
routes to a role, a named person on the record looks like a contradiction waiting to cause a bug.
Rejected because the contradiction was ours. Removing the fields would also take away the
submitter's ability to say who they expect to handle the work, which is information the requesting
side has and the performing side does not.

**Keep them, and route to them.** The literal reading of the source form, and the one the product
owner's answer rules out. It is also the case BDR-0011 identified as fatal to its own model: a
stage would gain a fixed occupant, queues would stop being role-shared, an authorization would wait
on one person being at their desk, and a **referral** would have to become a real transfer of
authority. Rejected by the answer rather than by us.

**Keep them as optional contacts.** The middle path, and rejected on the strength of one word: the
product owner said a named person **is required**. An optional field would let an authorization
into the relay with nobody accountable for the work at the far end of it.

## What it assumes

**That the named person is accountable for the work rather than for the signature.** The whole
decision rests on this split. If in practice the named finance approver is the only person
permitted to sign at that stage, then routing should follow the name and BDR-0011 falls with it.
The answer distinguishes working from advancing explicitly, so this is about as directly confirmed
as an assumption here gets — but it is still the joint that would break.

**That "required" means required at initiation rather than at draft.** Applied the same way as
every other completeness rule: a **Draft** may be incomplete, and completeness is enforced when the
submitter initiates.

**That the requesting side knows both names when raising the authorization.** The source form asks
for them at intake, so this is the process as it stands rather than something new being demanded.

## What changes if this is overturned

If the named person turns out to be the route, the blast radius is large and well understood
because BDR-0011 already mapped it: stages gain fixed occupants, the department queue stops being
the unit of work, **claim** stops being the mechanism that names an owner, **referral** becomes
reassignment, and the relay can be blocked by one person's absence. Every queue-shaped decision in
the project is downstream of this.

If instead the fields turn out to be genuinely optional, the change is small — a validation rule
relaxes and nothing else moves.
