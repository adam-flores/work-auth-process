# SQLite for the prototype's store

**Status:** accepted
**Supersedes:** [ADR-0003](0003-data-store-xml-or-sqlite.md)

[ADR-0003](0003-data-store-xml-or-sqlite.md) left persistence open between XML files and SQLite,
and named its own deciding trigger: *"decide before the first persisted entity is written."* The
spec crosses that line. The store is **SQLite**.

**The reason ADR-0003 gave for leaning this way no longer holds.** Its case was that the success
measures are aggregate queries and XML makes those hardest. Two decisions since have taken that
ground away. [ADR-0006](0006-insights-from-seeded-transition-history.md) computes every figure on
the insights dashboard as a fold over the transition log in TypeScript, and
[ADR-0004](0004-transition-log-and-global-relay-config.md) derives an authorization's position in
the relay rather than storing it — so the master dashboard cannot filter by stage in SQL either.
Neither surface asks the store an aggregate question. The argument that was supposed to carry this
decision does not carry it, and saying so matters more than arriving at the same answer anyway.

**What carries it instead is the append.** The store's job is to hold an **append-only log** and
hand it back whole. SQLite appends a row atomically, orders it, and survives a process dying
mid-write without anything being written to handle that. A document-per-authorization store pays
read-modify-write on every transition and hand-rolls both the ordering and the crash safety.

**A cold clone has to start with one command.** The prototype is demonstrated by other people
cloning the repository and running it, which makes install-time friction a real constraint rather
than a taste. `node:sqlite` ships inside Node, so there is no native module to compile on install
and no server to provision — the store is a file that appears on first run.

**The store is disposable.** It is rebuilt from the fixture generator rather than migrated, so a
schema change means deleting the file and re-seeding. This is what removes ADR-0003's stated cost —
*"costs a schema and migration discipline up front."* The schema stays; the discipline does not
arise, because there is never data worth preserving across a change. It is synthetic throughout.

## Considered options

- **JSON files.** Not one of ADR-0003's two options, which predate
  [ADR-0006](0006-insights-from-seeded-transition-history.md); the repository already holds its
  synthetic hierarchy this way. At this scale it is the genuinely simplest thing — the whole log
  fits in memory, appends are array pushes, and the "readable in a diff" benefit ADR-0003 credited
  to XML transfers without XML's ceremony. **Recommended and declined.** Recorded in full rather
  than in passing, because it is the option to reach for first if the schema ever starts costing
  more than it returns.
- **XML files.** ADR-0003's other named option. Its one distinctive advantage over JSON is
  nothing, and it shares every cost that ADR named — hand-rolled multi-record queries, and
  concurrent writes left as an exercise. It survived into ADR-0003 as a plausible shape for a
  form-like artifact rather than on its merits as a store.
- **A database server.** Never in ADR-0003's frame, and ruled out by the same constraint that
  rules out a native module: something to provision before the prototype runs. ADR-0003 already
  required both candidates to be file-backed and in-process.

## Consequences

**The schema is small, and deliberately not a relational model of the domain.** A transitions
table, a table of drafts, and the reference data the process runs against. An authorization's
field values after initiation are not columns — they fold out of the log
([ADR-0009](0009-the-draft-is-mutable-and-the-log-begins-at-initiation.md)). A reader expecting a
normalized schema of departments, resources and approvals will not find one, and should not.

**A transition carries a caller-supplied timestamp, defaulted from the clock.** The fixture
generator writes history spread over months ([ADR-0006](0006-insights-from-seeded-transition-history.md)),
which it cannot do if the store stamps every row with *now*. The default keeps live use honest.

**The store is seeded on first run and resettable on demand**, so a cold clone gets a populated
insights dashboard without a setup step, and a demo can be returned to a known state between
walkthroughs.

**Nothing outside the service module knows SQLite exists.** The choice is reversible at the cost
of one module ([ADR-0010](0010-the-service-module-is-the-seam.md)) — which is the level of
reversibility ADR-0003 said this decision would *not* have, and it is only true because the store
turned out to owe the product so little.
