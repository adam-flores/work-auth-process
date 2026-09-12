# BDR-0012: The performing department is fixed at initiation, and only the Administrator revokes

**Status:** final
**Date:** 2026-09-12
**Decided by:** product owner
**Supersedes:** [BDR-0005](0005-correction-in-place-and-revocation.md) in part — the
performing-department re-route, and revocation by an approver

## Decision

**The performing department cannot change after an authorization is initiated.** Asked who would
fix a wrong department, the product owner answered that the performing team is the only party who
would catch it, that they see it before they acknowledge, and that there would be no change after
that — **because a different department is a different request**.

So a wrong department is not a defect to be corrected. It ends the authorization, and the right
department is asked in a new one.

**The mechanism is the one that already exists.** The performing team raises a **correction
request** naming the performing department, exactly as they would for any other field. What is
different is that the submitter cannot satisfy it: the field is fixed, so their only resolution is
to **withdraw** and initiate a fresh authorization naming the right department. No new state, no
new transition kind, and no new actor.

**Approvers do not revoke.** Asked who specifically can revoke an authorization and when, the
product owner answered *N/A* — it is not something the process does. **Revoked** survives as a
state, but with a single cause: the **Administrator** deactivating or moving a department, which
revokes the in-flight work naming it
([BDR-0010](0010-an-administrator-maintains-the-hierarchy.md)). Every other ending is the
submitter's: **Withdrawn**.

## Why this, and not the alternatives

**Allowing the performing department to be corrected in place, re-routing from the handover.**
This is what [BDR-0005](0005-correction-in-place-and-revocation.md) decided and it is now
overturned. It was the loudest case of a general rule — a correction re-reviews the stages whose
concern it touches — and it looked like the rule's best illustration. The answer is that it is not
an instance of the rule at all, because the field it turns on is not editable.

It also contradicted a decision already on the record.
[BDR-0007](0007-one-project-many-resources.md) had already established that needing a department
other than the one named makes it **a new authorization**; BDR-0005 then allowed that same field
to be edited mid-relay. Both could not stand, and the product owner's answer settles it in
BDR-0007's favour. The boundary of a request is the project and the department, and that boundary
holds after initiation as well as before it.

**A dedicated decline transition for the performing team.** Rejected on cost. It reads more
honestly — the performing team is not really asking for a correction, they are saying *not us* —
but it adds a transition kind, a terminal path, and an interface for it, to express something the
correction request already expresses. A class prototype does not need the second mechanism.

**Keeping revocation open to any approver at or before the current stage.** Rejected on the
product owner's answer. It was our own widening, made on the reading that the trigger is the wider
initiative changing rather than a defect at a gate; nobody asked for it. Narrowing it costs
nothing and removes a power no role in the process was described as having.

**Folding Revoked into Withdrawn now that approvers cannot revoke.** Rejected, narrowly. One
cause is left, and it is not the submitter's — a hierarchy change ending work its owner still
wants is materially different from the owner abandoning it, and the submitter is notified precisely
because they did not cause it. The distinction in [`CONTEXT.md`](../../CONTEXT.md) survives with a
narrower actor list rather than collapsing.

## What it assumes

**That the performing team catches a wrong department before acknowledging, and that nothing
downstream catches one they miss.** The product owner named them as the only party who would
notice. If a later stage can also spot it, they inherit the same correction request and the same
dead end, which is no worse — but it means the defect can travel further than assumed.

**That "a different department is a different request" is about the record, not about effort.**
The submitter re-enters the request rather than having it re-routed, which is more work for them
than a correction would be. We read the answer as a statement about what an authorization *is*
rather than an acceptable cost, on the strength of BDR-0007 saying the same thing independently.

**That a correction request nobody can satisfy is not confusing in practice.** The alternative is
the decline transition rejected above. If the prototype's own walkthrough makes it read as a dead
end rather than an ending, the decline transition is the cheap fix.

## What changes if this is overturned

**If the performing department can in fact be corrected**, BDR-0005's re-route returns as written
and this record goes with it. Contained: the field-dependency mechanism was never removed, only
the one field's use of it, and re-routing from the handover is already the shape
[ADR-0005](../adr/0005-field-dependencies-drive-re-review.md) holds.

**If some approver does need to end an authorization**, revocation widens back out. Small — the
state, the mandatory comment, and the terminal transition all still exist; only the list of who
may cause it changes.
