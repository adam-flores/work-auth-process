# The transition log is the record, and one global relay config routes against it

**Status:** accepted

[BDR-0003](../bdr/0003-the-authorization-lifecycle.md) settles what an authorization's
lifecycle *is*: five explicit states, position in the relay derived rather than stored, and four
timestamps at every stage. This records the shape that holds it. It is separated from the BDR
because the business decision survives if this one is wrong, and because
[ADR-0003](0003-data-store-xml-or-sqlite.md) names "deciding the lifecycle late and by accident"
as the failure mode it exists to prevent — this is the decision that clears it.

Three parts.

**The append-only transition log is the record.** Every advance, denial, hold, claim,
acknowledgement, gate skip, and mint is appended as a transition carrying its actor, its kind,
and its timestamp. Nothing is updated in place. Current state — the stage an authorization sits
at, and whether that stage is awaiting action, has returned it, or is a re-review — is a fold
over the log, computed on read.

**One global relay configuration, consulted at each step.** The relay is a single ordered list
of stages held as configuration, not copied onto each authorization at creation. Each stage is
a `{side, kind, concern}` triple, which is what [`CONTEXT.md`](../../CONTEXT.md) already defines
a stage to be. Routing means asking that configuration what comes next.

**A configuration change reaches work already in flight.** If an edit changes or inserts a stage
an authorization has already passed, the authorization **returns to that stage and re-progresses
forward**. An approver receiving something they previously approved is shown it as a
**re-review**, not as a fresh arrival.

## Considered options

- **A status column, updated in place.** The conventional shape, and the one this rejects. It
  answers *where is this now* cheaply and *when did it arrive at performing finance* not at all
  — which is the pair M1–M3 are defined in terms of. History would have to be logged separately
  anyway, at which point there are two sources of truth that can disagree.

- **Stamping the relay onto each authorization at creation.** Genuinely attractive: an in-flight
  authorization keeps the relay it started under, so a configuration edit cannot reshape work
  already moving, and the master dashboard can always explain why one authorization has six
  stages and another four. Rejected because it makes the relay's definition unfixable for
  anything already in flight — a corrected or newly required stage would apply only to
  authorizations raised after the edit, which is the wrong behaviour for a control structure.
  The cost of rejecting it is that history must be reconstructed from the log rather than read
  off the record, which the log already supports.

- **Configuration changes applying only to authorizations not yet started.** The middle path,
  and the weakest. It avoids re-review entirely at the price of a fleet of authorizations moving
  under quietly different rules, with nothing on any of them saying which.

## Consequences

**Re-review is a first-class transition kind, not a flag on an arrival.** An approver has to be
able to tell "you approved this, and the rules changed" from "this is new." That distinction is
visible in a queue, which means it is part of what a queue shows, not only part of what the log
holds.

**A gate skip is an explicit transition.** [BDR-0003](../bdr/0003-the-authorization-lifecycle.md)
requires the value that decided a skip to be recorded, and re-progression is why: when an
authorization returns to an earlier stage, the system has to know whether a gate was skipped on
evidence or never reached, and whether the evidence still holds. Under an absent-stage model
that is unanswerable.

**Reading current state costs a fold.** Acceptable at prototype volumes with synthetic data
only. If it ever stops being acceptable, the answer is a cached projection rebuilt from the log,
not a hand-maintained status column — the log stays the record.

**This constrains [ADR-0003](0003-data-store-xml-or-sqlite.md) without deciding it.** An
append-only log with aggregate queries over transitions is the shape both candidates now have to
serve, and it is the case that ADR's current leaning already rests on. That ADR stays open.

**The `{side, kind, concern}` stage triple is not new here.** It is what
[BDR-0002](../bdr/0002-the-cast-and-what-each-role-needs.md) settled and what
[`CONTEXT.md`](../../CONTEXT.md) defines; this ADR only records that routing reads it directly
rather than mapping it onto bespoke per-stage names.
