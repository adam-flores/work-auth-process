# Each stage declares the fields its concern depends on, and corrections re-review against them

**Status:** accepted

[BDR-0005](../bdr/0005-correction-in-place-and-revocation.md) settles what happens when a stage
finds a defect: the authorization is corrected in place, and a correction to a field an
already-passed stage depends on returns it to that stage as a **re-review**. This records the
shape that makes "depends on" computable. It extends
[ADR-0004](0004-transition-log-and-global-relay-config.md) rather than replacing it — the
transition log and the single global relay configuration are unchanged.

**A stage declares its field dependencies in the relay configuration.** ADR-0004 holds each stage
as a `{side, kind, concern}` triple. A fourth member is added: the set of fields the stage's
concern rests on. A correction transition carries the fields it changed; routing intersects that
set with each passed stage's declared dependencies, and every stage that intersects is re-entered
as a re-review, in relay order.

**Re-review therefore has two causes and one mechanism.** ADR-0004 introduced it for the relay's
*configuration* changing beneath an authorization. A correction is the *data* changing beneath it.
Both mean an approver sees something they already acted on, and both must be distinguishable from
a fresh arrival for the same reason — so they share the transition kind and differ in the cause
recorded on it. The approver is told which.

**A correction that intersects nothing disturbs nobody.** It is applied, logged, and the
authorization resumes at the stage that requested it.

**Superseded contributions stay in the log.** Where a correction re-routes an entire side — the
performing department changing is the case BDR-0005 names — the prior side's contributions and
acknowledgements are marked superseded rather than deleted. The log is append-only (ADR-0004), and
what went wrong is the part a pilot most needs to read.

## Considered options

- **Re-run the whole relay after any correction.** Simple, defensible, and wrong for this process:
  it turns a typo into six fresh sign-offs, which is precisely the rework the project exists to
  remove. It also makes every correction look identical in the record, so the measure of what
  defects actually cost is lost.

- **Re-run nothing; all corrections are forward-only.** The cheapest option, and the one that
  breaks the control. A performing-side sign-off collected from a department that is not doing the
  work is not a control at all, and the relay's stated purpose is stopping what is not allowed.

- **A hand-written matrix of which corrections re-enter which stages.** The obvious way to get
  the behaviour without a general mechanism. Rejected because it is a second thing to keep in step
  with the relay configuration: adding or reordering a stage would silently leave the matrix
  wrong, and nothing would say so. Declaring dependencies on the stage keeps one source of truth
  and keeps [BDR-0001](../bdr/0001-preserve-the-flow-rebuild-the-experience.md)'s promise that
  resequencing costs a configuration edit.

- **Deriving dependencies from what a stage displays.** Attractive because
  [#33](https://github.com/adam-flores/work-auth-process/issues/33) is deciding what each queue
  shows anyway. Rejected: *shown* and *judged* are deliberately different. Global Trade is to be
  given every attribute, and an approver reading a field for context has not made their sign-off
  depend on it.

## Consequences

**A stage whose concern rests on nothing in the form declares no dependencies**, and its sign-off
survives every correction. The requesting finance approver is the live case — they confirm funding
that exists outside this process. BDR-0005 records this as an assumption that may mean their
concern is under-modelled rather than genuinely independent.

**The declared set is a design artifact the business owns**, not an implementation detail. It says
which sign-offs a given correction invalidates, which is a control question. It belongs beside the
criteria that [BDR-0002](../bdr/0002-the-cast-and-what-each-role-needs.md) puts in the hands of the
role that judges the field.

**Current state still costs a fold**, unchanged from ADR-0004, and re-review makes the fold
slightly harder: a stage may appear several times in the log, and only the latest occurrence is
live. This is the same constraint ADR-0004 already accepted at prototype volumes.

**`awaiting correction` is a stage-level condition, not a state.** It is read from the log like
every other position: a correction requested and not yet supplied. It adds no row to the five
recorded states.

**This tightens [ADR-0003](0003-data-store-xml-or-sqlite.md) without deciding it.** Intersecting a
changed-field set against per-stage dependencies is a read over configuration, not over data, so
it adds nothing either candidate store has to serve. That ADR stays open.
