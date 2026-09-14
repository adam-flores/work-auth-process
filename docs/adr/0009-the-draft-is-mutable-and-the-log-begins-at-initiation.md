# The draft is mutable state, and the log begins at initiation

**Status:** accepted

[ADR-0004](0004-transition-log-and-global-relay-config.md) says the append-only transition log is
the record and **nothing is updated in place**. Read without qualification, that makes a **Draft**
a sequence of transitions. It cannot be one, and this records why and what happens instead.

Two settled decisions forbid it. [`CONTEXT.md`](../../CONTEXT.md) defines **initiation** as the
point where *"the audit trail starts here; nothing before it is preserved."*
[BDR-0006](../bdr/0006-what-the-product-records.md) goes further: measurement begins at initiation,
the product records nothing about the form-filling experience, and **an abandoned draft leaves no
trace**. A draft held as transitions would have to be *deleted* from an append-only log to satisfy
that — which breaks the log's one rule far harder than holding drafts somewhere else does.

**A draft is mutable state, updated in place, with no history.** The submitter edits it, the system
keeps only its current contents and when it was last modified, and deleting it — by the submitter,
or by the system a month after it was last touched — removes it entirely. Nothing is appended,
because nothing is being recorded yet.

**Initiation writes the first transition, and carries the draft's contents as its payload.** The
draft is discharged into the log at the moment it becomes the record. Before that there is no
authorization to have a history; after it there is nothing but history.

**After initiation, field values fold out of the log like everything else.** ADR-0004 only ever
said *position* folds. It has to be said explicitly for values too, because
[ADR-0005](0005-field-dependencies-drive-re-review.md) depends on a **correction** transition
carrying the fields it changed — that set is what re-review intersects against a stage's declared
dependencies. So a contribution and a correction each carry their field values into the log, and
the current value of any field is the last one written to it.

## Considered options

- **Drafts as transitions too, for one uniform shape.** The tidier architecture, and the one this
  rejects. It buys consistency at the price of either keeping a record of every abandoned draft —
  which BDR-0006 rules out — or deleting rows from an append-only log, which is worse than the
  asymmetry it was trying to remove. The asymmetry is not a compromise: a draft genuinely is not
  yet the record, and the two shapes say so.

- **Field values as columns, updated in place, with the log recording only process events.** The
  conventional split, and superficially attractive because a draft and an initiated authorization
  would then share one shape. Rejected because ADR-0005 needs the changed-field set *in the log* to
  compute re-review, so the values end up there regardless — at which point a column holding the
  same value is a second source of truth that can disagree with the first.

- **A projection table of current values, rebuilt from the log.** Not rejected — deferred, on the
  trigger ADR-0004 already set: *"if it ever stops being acceptable, the answer is a cached
  projection rebuilt from the log, not a hand-maintained status column."* At prototype volumes,
  with synthetic data only, the fold is free and a cache is a thing that can be stale.

## Consequences

**M2's clock cannot accidentally measure drafting.** [BDR-0006](../bdr/0006-what-the-product-records.md)
says cycle time starts at initiation; here that is structural rather than a reporting convention,
because before initiation there is no timestamp in the log to start from. A business decision that
would otherwise need enforcing is enforced by there being nothing to enforce.

**A draft has no audit trail, and the question "who changed what, and when" is unanswerable for
one.** Accepted rather than mitigated. It is the direct cost of BDR-0006's decision that an
abandoned draft leaves no trace, and it is only tolerable because a draft is visible to everyone
on the master dashboard while it exists — what is lost is its history, not its existence.

**The store holds two shapes** ([ADR-0008](0008-sqlite-for-the-prototype-store.md)): a table of
drafts that is updated and deleted like ordinary rows, and a transitions table that is only ever
appended to. Anything that enforces append-only — a trigger, a review convention, a test — applies
to the second and must not be applied to the first.

**Validation runs twice over the same rules, not two sets of them.** A draft is allowed to be
incomplete; initiation is where completeness is required. That is one rule set evaluated at two
strictnesses, which is what [ADR-0002](0002-node-for-services.md)'s shared-rules constraint already
demands of anything written here.
