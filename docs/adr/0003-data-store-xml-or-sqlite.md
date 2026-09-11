# Data store: XML files or SQLite — undecided

**Status:** proposed — deliberately open

Persistence for the prototype will be either XML files on disk or SQLite. This is recorded
now, while undecided, because it is the one stack choice here that is genuinely expensive to
reverse: the storage shape leaks into the service layer, the fixtures, and any reporting we
build for the success measures. Deciding it late and by accident is the failure mode this
ADR exists to prevent. Neither option is a server — both are file-backed and run in-process,
so the prototype stays self-contained with nothing to provision.

## What the choice has to serve

- **An authorization has a lifecycle**, not just a shape: drafted, submitted, corrected,
  resubmitted, approved. Something has to hold state transitions and who made them.
- **The candidate success measures are queries** (`docs/source/BUSINESS_CASE.md` §6): first-pass
  acceptance rate, cycle time, resubmissions per authorization, SME interactions. If the
  prototype is meant to demonstrate M1–M6, the store has to answer aggregate questions.
- **Only synthetic data ever lands in it** (CLAUDE.md, Data handling), so durability,
  concurrency at scale, and backup are not real constraints here.
- **A real deployment would not use either one.** Whichever we pick is a prototype stand-in
  for whatever system of record the organization already runs, and the legal entities
  involved use different reporting systems (`docs/source/BUSINESS_CASE.md` §8). The prototype must not
  assume it owns the data.

## Considered options

- **SQLite.** Handles the lifecycle and the metrics queries directly; still a single file
  with no server. Costs a schema and migration discipline up front.
- **XML files.** No schema step, and the documents are human-readable in a diff, which has
  some demonstration value for a form-shaped artifact. The cost lands later: multi-record
  queries and any state-transition history are hand-rolled, and concurrent writes are a
  problem we would have to solve ourselves.

**Current leaning: SQLite**, on the strength of the metrics requirement — M1 through M6 are
aggregate queries, and that is the thing XML files make hardest. Not decided.

## Deciding trigger

Decide before the first persisted entity is written, and supersede this ADR with the
outcome. Building against "either one" is not a viable middle path — an abstraction layer
hiding the difference would cost more than picking wrong.
