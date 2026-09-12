# BDR-0010: An Administrator maintains the hierarchy, and moving a department cancels its in-flight work

**Status:** final
**Date:** 2026-09-12
**Decided by:** product owner

## Decision

Seven answers, recorded together because they describe one capability: who owns the data the
process runs on, what they may do to it, and what that does to work already moving.

**A fourth role exists — the Administrator — and it never appears in a relay.** It maintains what
the process runs on rather than acting on any authorization: the organizational hierarchy, the
permissibility rules, the relay configuration, the insights dashboard, and the log of its own
changes. Every other role in [`CONTEXT.md`](../../CONTEXT.md) is defined by an act performed *on an
authorization*; this one is defined by an act performed on everything authorizations are measured
against.

This names a role three settled decisions were already spending. The insights dashboard is
"restricted to administrators"
([BDR-0006](0006-what-the-product-records.md)), an unfindable department is resolved by "the
submitter and an administrator"
([BDR-0008](0008-finding-a-department.md)), and the relay configuration
([ADR-0004](../adr/0004-transition-log-and-global-relay-config.md)) had no owner at all. The role
was load-bearing before it was defined.

**Departments are never deleted. They are marked inactive.** Inactive means closed to new
authorizations while remaining permanently resolvable, so no existing record can point at
something that has ceased to exist. The same holds at every level.

**Merge and split are not operations.** A merge is a department marked inactive alongside whatever
the surviving department already is; a split is one or more departments added. Nothing rewrites an
existing department into a different one, so neither needs handling of its own.

**A change to where a department sits, or whether it is active, cancels every in-flight
authorization that names it. A rename does not.** Re-parenting and deactivation change what a
department *is* — including the attributes it inherits, which is what a permissibility rule is
evaluated against. A rename changes only what it is called: no identity, no parentage, no inherited
attribute, and therefore nothing about the authorization's routing or its truth.

**A cancellation is a Revocation, performed by the Administrator.** No sixth state is added.
Revocation already exists for the case where "the wider initiative changing" ends an authorization
rather than a defect at a gate ([BDR-0005](0005-correction-in-place-and-revocation.md)), which is a
restructure almost verbatim. Its actor widens from *any approver* to *any approver, or the
Administrator*; the mandatory comment is supplied by the system rather than typed. **The submitter
is notified**, which widens notification past queue arrival for the first time — a revoked
authorization arrives in nobody's queue, so the alternative was silence.

**Drafts are untouched.** A draft is not in the relay, so a hierarchy change has nothing to reach:
it simply re-resolves live, and a draft naming a department that has gone inactive is the
already-settled unfindable-department case that leaves it sitting in Draft
([BDR-0008](0008-finding-a-department.md)) until the submitter and an Administrator resolve it.

**A completed authorization must read as the structure it was completed under.** The requirement is
the record's, not the hierarchy's: cost was allocated between departments as they then sat, and a
later restructure may not retroactively change what a settled record says it allocated.
[ADR-0007](../adr/0007-classification-resolves-live-and-freezes-at-terminal.md) holds the shape that
delivers this.

### What is built

| Operation | Built | Note |
|---|:--:|---|
| Add a department | ● | The path [BDR-0008](0008-finding-a-department.md) leaves a submitter parked in Draft waiting for |
| Rename a department | ● | Does not cancel |
| Mark a department inactive | ● | Cancels in-flight work naming it |
| Change log — actor, change, timestamp | ● | Administrator only, and deliberately *not* on the insights dashboard |
| Re-parent a department | — | Specified here, deferred |
| Bulk import | — | A data-loading feature; demonstrates nothing this project argues |

Re-parenting is deferred because it is the operation with the expensive consequence and the one
nobody performs in a demonstration. The decision about what it *does* is recorded all the same, so
building it later is implementation rather than a reopened question.

The change log is kept off the insights dashboard on purpose. That surface "shows no individual:
nothing on it attributes time or defects to a named person"
([BDR-0006](0006-what-the-product-records.md)), and a change log exists precisely to say who made a
change. Putting it there would breach that rule for the first time.

## Why this, and not the alternatives

**Hanging maintenance off the Charge Number Admin.** Superficially attractive — it is already the
non-judging, value-supplying role, and it already has *Admin* in its name. Rejected because that
role is a **stage in the relay** with a queue and a position. Fusing a relay participant with a
custodian of the data the relay routes against would make a restructure look like process work, and
would give one authorization's participant authority over every other authorization in the system.

**Granting maintenance to approvers**, on the grounds that they are the ones who encounter bad
reference data. Rejected as already contradicted: a restricted audience exists whether or not it is
named, because the insights dashboard is "the one surface that is not open to everyone."

**Re-checking permissibility on in-flight work**, rather than cancelling it. This was the
recommendation put to the product owner and it lost to something blunter. Because a hierarchy change
can alter an inherited attribute, an authorization permissible at entry can become impermissible
mid-relay with nobody touching it — a real hole in a control whose stated purpose is stopping what
is not allowed. Cancellation closes the hole without the machinery, and the product owner's reason
is the decisive one: the scenario is fringe, and precision bought in a case the prototype will never
demonstrate is precision paid for twice.

**Re-pointing in-flight authorizations to a surviving department on a merge.** Also recommended and
also rejected. The argument for it was that cancellation discards acknowledgements already collected
on work that is still genuinely wanted, and that the machinery exists — changing the performing
department already re-routes from the handover
([BDR-0005](0005-correction-in-place-and-revocation.md)). It loses because a merge on paper is not a
statement that the surviving department accepts the closing one's commitments, and the blanket rule
makes the question moot.

**Routing a cancellation through re-review.** Rejected as a category error rather than on cost.
Re-review is for an approver seeing something *they already acted on*
([ADR-0005](../adr/0005-field-dependencies-drive-re-review.md)); nobody acts on permissibility,
which is an entry check and not a stage. Routing it there would invent a stage that does not exist.

**Deleting a department once nothing in flight references it.** Sounds disciplined and breaks in
exactly the case that matters: "nothing in flight" is satisfiable while completed authorizations
still point at it, so the audit trail breaks precisely when the records are old enough for anyone to
be auditing them.

**A sixth state, `Cancelled`.** Rejected as out of proportion — a new terminal state, for a scenario
the product owner has called fringe, behaving identically to one that already exists. **Withdrawn**
was rejected for a stronger reason: it means "the submitter no longer wants it," which would be a
false statement on the record.

**Blocking a hierarchy change while work is in flight.** Rejected because it puts the Administrator
in a standoff with the relay: a department cannot be closed until its work drains, and its work
drains through approvers who may be exactly the people the restructure removed. That is how
reference data becomes permanently wrong.

## What it assumes

**That restructures are rare enough for blanket cancellation to be acceptable.** The product owner
called the scenario fringe and this decision is built on that. If departments move often, the
product routinely destroys work that was progressing correctly, and the re-check and re-pointing
options rejected above come back on cost grounds rather than on principle.

**That cancelled work is genuinely re-raisable.** Cancellation discards every acknowledgement
collected so far, and the submitter starts again. This is acceptable only if re-raising is cheap —
which is a claim about the product this project is building rather than about the process it is
replacing.

**That a department's name encodes nothing.** The rename exemption rests entirely on this. It holds
in the settled model, where "the names carry the meaning" for *search* but "a department's **name**
is not an attribute" ([BDR-0008](0008-finding-a-department.md)). If any part of the organization
reads jurisdiction, ownership, or funding out of a name, renaming becomes a substantive change and
the exemption is wrong.

**That nobody outside the Administrator needs to edit reference data.** The organization may well
maintain its hierarchy in a system of record this process only reads from. Nothing here has been
confirmed about where the real hierarchy lives or who owns it, and the process owner has not been
asked.

**That restructures arrive one department at a time.** An acquisition plausibly arrives as a whole
legal entity, which is the case bulk import exists for. Ruled out as a data-loading feature rather
than because anyone has said acquisitions are small.

## What changes if this is overturned

**If blanket cancellation is too blunt**, the two options rejected above return, and the mechanism
for both already exists — re-routing on a changed performing department is
[BDR-0005](0005-correction-in-place-and-revocation.md)'s, and re-evaluating a rule against a passed
stage is [ADR-0005](../adr/0005-field-dependencies-drive-re-review.md)'s. The cost is a third
trigger for re-review and a permissibility check that runs somewhere other than at entry. Contained,
and the most likely of these to happen.

**If the Administrator is not one role**, it splits along the obvious seam: reference data on one
side, relay configuration and insights on the other. Nothing else moves, because the role has no
position in the relay to reallocate.

**If renaming has to cancel after all**, the product loses its only demonstrable hierarchy edit —
add and rename are what is built, so a cancelling rename makes the one admin action shown in a
demonstration destroy live work on screen. Cheap to change, expensive to show.

**If a sixth state is needed**, the glossary gains a row, the insights dashboard gains a category
it must report separately, and every fold over the transition log that branches on terminal states
gains a case. Small but wide.

**If re-parenting has to be built**, the deferred consequence lands rather than a new decision being
needed: the cancel rule and the freeze rule both already cover it.
