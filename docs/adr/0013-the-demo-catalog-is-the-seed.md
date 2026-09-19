# The demo catalog is the seed; the transcribed hierarchy is historical

**Status:** accepted
**Supersedes:** [ADR-0012](0012-the-store-holds-a-decoded-hierarchy-not-a-transcribed-one.md) in
part — the specific content it documents, not the seeding mechanism it decides

[#92](https://github.com/adam-flores/work-auth-process/issues/92) replaces what a running store
actually seeds with, without touching how seeding works. This records that split.

**The seeded fixture is now `docs/reference/demo-hierarchy.json`**: one legal entity, two
divisions, five departments — small enough for a presenter to hold in their head and narrate live,
with just enough shape that the department picker (BDR-0008) still narrows a real list rather than
offering a single option. `src/hierarchy/fixture.ts`'s `FIXTURE_PATH` points at it, and both
`npm run reset` and the in-app reset read it — there is one seed, not a demo profile running
alongside a realistic one, matching the earlier decision against maintaining two.

**It is freshly authored, not a trimmed subset.** A subset of the 58-department fixture would
still carry the collision and disclosure-treatment complexity ADR-0012 exists to handle, which
this catalog deliberately does not show. Nothing in it is transcribed from a chart; there is no
conflated code column, no comma-separated code field, no shared cost centre, and no near-identical
sibling name to disambiguate. Every attribute ADR-0012 defines still appears at least once —
`affiliation` (legal-entity level, inherited by every department — the full three-level chain,
even with only one legal entity), `jurisdiction`, `home-office-disclosure` (held at the division
level on one division, so both its departments inherit it without carrying it directly — the same
inheritance case ADR-0012's consequences call out), `offshore-shared-service`, and
`contracting-exception` — so the picker and the permissibility rule both still have something real
to work against.

**The seeding mechanism is unchanged and governs this catalog too.** ADR-0012 decided deterministic
ids derived from names, the attribute/detail split, and seeding an unclassifiable department
inactive rather than guessing. None of that was specific to the old fixture's content, and none of
it changed: `transform()` (`src/hierarchy/transform.ts`) is the same function, unmodified, reading
a different file.

**`docs/reference/organization-hierarchy.json` stays in the repository, and stops being what the
store loads.** It is the historical record of the careful transcription and decoding work ADR-0012
describes — the fixture, its `.md` companion, and every irregularity called out there are
unchanged and still readable. What changes is that `readFixture()` no longer points at it. Losing
that record was rejected: the transcription work is the interesting part of ADR-0012's argument,
and deleting the fixture it argues about would make the ADR unreadable in place.

**Coverage of the old fixture's irregularity-handling moved with it, not away from it.** The
service-seam hierarchy tests (`tests/service/hierarchy.test.ts`) now describe the demo catalog's
own shape — counts, attribute inheritance, the active flag — since that is what a running store
actually contains. The transformation behaviour specific to the old fixture's content (a cost
centre shared by four departments, `CAL`'s conflated code column, three codes crammed into one
field, near-identical sibling names) is still exercised, directly against
`docs/reference/organization-hierarchy.json`, by a dedicated unit test
(`tests/service/legacy-fixture-transform.test.ts`) that calls `transform()` without seeding a
store. Nothing about `transform()`'s harder branches lost coverage; what changed is which fixture
proves them.

## Considered options

- **Keep the 58-department fixture as the seed and add a separate demo profile.** Rejected — this
  is exactly the parallel-profile approach the earlier decision this issue implements ruled out.
  Two catalogs to keep in sync is a second thing to maintain for no behavioural gain; the demo
  catalog is smaller precisely so there is only ever one seed to reason about.

- **Trim the 58-department fixture down to five departments.** Rejected in the issue itself: a
  trimmed subset still carries the collision and disclosure-treatment complexity ADR-0012 exists to
  handle, and showing that complexity in miniature is not what a three-minute demo needs.

- **Delete `docs/reference/organization-hierarchy.json` once it stops being the seed.** Rejected.
  The fixture and ADR-0012's analysis of it are the same artifact in two forms; removing one leaves
  the other referring to data nobody can see.

## Consequences

**A reader of ADR-0012 needs this record to know what currently runs.** ADR-0012 is marked
"superseded in part," pointing here, so nobody mistakes its specific counts and content claims —
58 departments, cost centre `20514`, `CAL`'s conflated code column — for a description of the
running store.

**The demo catalog is a product decision as much as a technical one**, and it is sized for a demo
script that does not exist yet ([#92](https://github.com/adam-flores/work-auth-process/issues/92)
leaves the script itself to a later issue). If that script needs a department this catalog does not
have — a second requesting-side department, say — extending it is a small edit to
`docs/reference/demo-hierarchy.json` and nothing else; the mechanism this ADR relies on does not
change.
