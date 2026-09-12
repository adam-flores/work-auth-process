# BDR-0007: One project, one performing department, one-to-many resources

**Status:** final
**Date:** 2026-09-11
**Decided by:** product owner

## Decision

Three answers, recorded together because they describe one thing: what a request *is*, what it is
not allowed to be, and what people see of it.

**A request is one project, from one department to another, fulfilled by one-to-many resources.**
The performing department is named once on the authorization, not per line. Each resource line
carries its own budget hours and labor rate; everything else — the project, both departments, the
relay, the approvals — is shared by the whole authorization.

**The boundary is the project and the department.** The moment a request covers more than one
project, or needs resources from a department other than the one already named, it is a **new
authorization**. This is what keeps the record one ask rather than a container of unrelated work,
and it is why the relay can stay a single sequence.

**One charge number per authorization.** It completes the whole record, as
[BDR-0003](0003-the-authorization-lifecycle.md) already has it — not one per resource line.

**Permissibility is a configurable list of disallowed department pairings**, evaluated at entry.
The prototype seeds it with one rule: a **foreign department may not perform work for a domestic
department**. Anyone with access to the list can add combinations. This settles the open question
from [BDR-0005](0005-correction-in-place-and-revocation.md) — whether a permissibility constraint
is a property of the department, of the pairing, or of the work. It is **the pairing**, and it is
data rather than code.

**Every participant sees the whole record.** No stage sees less than any other. A queue is a list
of what is waiting on you; opening an item shows everything on it.
[BDR-0002](0002-the-cast-and-what-each-role-needs.md) said a queue shows an approver "only what
they need to act" — that is about how dense a *list* is, not about access, and it was being read as
a scoping rule it was never meant to be. There is nothing on an authorization to protect: the
record is already open to everyone on the master dashboard, and the labor figures are average rates
rather than actual compensation.

### A correction to the record

An earlier reading had Global Trade as a deliberate exception to a minimal-queue rule, on the
strength of the product owner's answer *"the determination is made from a combination of existing
fields — give them all the attributes."* That answer was about **where the export classification
comes from** — it is derived from fields already on the form rather than selected separately — and
says nothing about queue design. There is no minimal-queue rule and therefore no exception.

## Why this, and not the alternatives

**A capability list on each department.** Proposed and rejected by the product owner as heavier
than the prototype needs. It also models the wrong thing: the failure case named is a *pairing*
that is not allowed, not a department that cannot do the work at all. A pairing list expresses that
directly and is configurable without a data migration.

**One charge number per resource line.** Rejected. Completion is caused by a charge number
existing ([BDR-0003](0003-the-authorization-lifecycle.md)); several would mean the authorization
completes in pieces, and nothing in the process describes a partially completed request.

**Several projects on one authorization.** Rejected by the boundary above. It would make the
performing department ambiguous and the ledger allocation — the thing the relay exists to keep
honest — impossible to attribute.

**Tailoring what each of the six stages sees.** Rejected: six designs, no argument behind them,
and no confidentiality basis for restricting anything.

## What it assumes

**That resource lines never need different departments.** The boundary rule depends on it. If a
project genuinely needs two people from two departments as one ask, this forces two authorizations
where the business thinks of one.

**That the disallowed-pairing list stays short enough to be a list.** If real permissibility needs
rules with conditions — *this pairing is disallowed unless the funding source is X* — the flat
list becomes a rules engine, which is a different build.

**That foreign↔domestic is a fair sample of the real constraint's shape.** It is synthetic by
design; the repository does not encode real export control rules.

## What changes if this is overturned

**If a request can span departments**, the performing department moves from the authorization onto
the resource line, and the relay has to run per-department. That is the expensive one — it changes
the record, the routing, and the completion condition together.

**If anything must be hidden from a stage**, the record gains a visibility model it currently does
not have, and the master dashboard's open-to-everyone rule goes with it.

**If the pairing list needs conditions**, it becomes a rules engine. Contained — nothing else here
depends on how the check is expressed, only on it happening at entry.
