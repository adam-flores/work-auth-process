# The classification resolves live and freezes when the authorization reaches a terminal state

**Status:** accepted

[BDR-0010](../bdr/0010-an-administrator-maintains-the-hierarchy.md) requires that a completed
authorization reads as the structure it was completed under: cost was allocated between departments
as they then sat, and a later restructure may not retroactively change what a settled record says.
This records the shape that delivers it.

The requirement has bite because of a decision already taken. The department picker "resolves to a
department, and the levels above it are derived"
([BDR-0008](../bdr/0008-finding-a-department.md)) — the record deliberately holds **one reference**
rather than three keyed values, which removed a class of transcription error. The consequence is
that what an authorization *says* is whatever the hierarchy says today.

**The hierarchy is edited in place. Nothing is versioned.** An edit changes the department; there is
no sequence of hierarchy versions and no "as at" query.

**A live authorization resolves live.** A Draft or an in-flight authorization holds its single
department reference and reads the hierarchy as it currently stands, for both sides.

**The terminal transition carries the resolved classification.** When an authorization reaches
**Completed**, **Withdrawn** or **Revoked**, the transition that takes it there records the three
resolved levels for each side. From that point the record reads its classification from that
transition and never from the hierarchy again.

This introduces no new storage concept. [ADR-0004](0004-transition-log-and-global-relay-config.md)
already makes the append-only transition log *the* record, with current state a fold over it, and
every transition already carries its actor, kind and timestamp. Freezing is one additional payload
on one transition that is written anyway.

**Hierarchy edits get their own append-only log, separate from the transition log.** A transition is
defined as "one recorded change to an **authorization**" ([`CONTEXT.md`](../../CONTEXT.md)), and a
hierarchy edit is not that. It gets the same discipline — appended, never altered, carrying actor
and timestamp — in its own log, which is what BDR-0010's change log reads from.

**A cancellation is an ordinary revocation transition.** When an Administrator re-parents or
deactivates a department, the edit emits one revocation per affected in-flight authorization, each
appended like any other. The fold that reads current state gains no case for it, and each cancelled
authorization freezes its classification on the way out like every other terminal transition.

## Considered options

- **A versioned hierarchy.** An edit publishes a new version; earlier versions are never altered;
  each authorization records the version it was raised under and resolves against it. The most
  capable option and the one a real deployment needs, because it is the only one that can answer
  *what did the whole chart look like in March* — which is a question an auditor asks and this
  design cannot answer. Rejected on cost by the product owner, on the explicit grounds that this is
  a prototype that will not go live. Recorded here as the option to reach for first if that ever
  changes.

- **Snapshot onto the record at initiation.** The three levels are copied onto the authorization
  when it is released into the relay and never change. Truthful, and genuinely the simplest thing
  that preserves history. Rejected because it freezes work that is still moving for no benefit: a
  department name corrected centrally would never reach a single live authorization, and nothing on
  the record would distinguish a stale snapshot from a deliberate one. It also partly undoes
  [BDR-0008](../bdr/0008-finding-a-department.md)'s reason for holding one reference, by
  reintroducing three stored values — system-written rather than keyed, but drifting all the same.

- **Edit in place with no freeze at all.** The cheapest option and the only one rejected on
  correctness rather than cost. A completed authorization would silently re-read as an allocation
  between legal entities that were not the ones involved. A project arguing for better records
  cannot ship the component that rewrites them.

- **Freezing only on `Completed`.** Defensible — only a completed authorization allocated anything,
  so only it has a ledger position to protect. Rejected for being two rules where one will do.
  "Freeze on terminal" needs no case analysis, and a withdrawn or revoked authorization is exactly
  the kind a pilot reads back to find out what went wrong.

## Consequences

**A rename reaches everything still moving and nothing already settled.** This falls out of the
design rather than being arranged, and it is the behaviour both halves of
[BDR-0010](../bdr/0010-an-administrator-maintains-the-hierarchy.md) want: a rename does not cancel,
so live work should see the correction, and a settled record should not.

**Terminal states now carry data, not just position.** Previously a terminal state was a fact read
from the log; it is now also the point at which the record captures something it cannot recover
later. Any future path to a terminal state has to write the classification, and one that forgets
produces a record that silently reads live forever.

**The hierarchy cannot be reconstructed as at a date.** The change log says what changed and when,
so in principle a chart could be replayed backwards from it, but nothing here commits to that and
no surface offers it. This is the price of rejecting versioning and the most likely reason to
revisit this ADR.

**Inactive departments must remain readable indefinitely**, which means the store never deletes a
department row. [BDR-0010](../bdr/0010-an-administrator-maintains-the-hierarchy.md) already requires
this of the business; it is recorded here as a constraint on the store because it is the kind of
thing a cleanup task removes by accident.

**Re-parenting is covered by this shape even though it is not built.** The freeze rule and the
cancel rule between them fully determine its behaviour, so building it later is implementation
rather than a reopened decision.

**This adds almost nothing to [ADR-0003](0003-data-store-xml-or-sqlite.md).** One extra payload on
an existing append, a second append-only log, and a no-delete constraint on one table. Both
candidate stores serve that equally, so that ADR stays open.
