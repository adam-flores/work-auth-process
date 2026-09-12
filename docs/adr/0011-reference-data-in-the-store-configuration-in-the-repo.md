# Reference data lives in the store; the relay and the criteria ship with the repository

**Status:** accepted

The process runs against four bodies of reference data, and they do not all need to be editable for
the prototype to make its argument. Two are held in the store and maintained by the
**Administrator** through real surfaces; two ship as versioned configuration and change by pull
request.

| | Where it lives | Editable in the product |
|---|---|---|
| Organizational hierarchy | Store, seeded from the synthetic fixture | **Yes** — add, rename, set inactive, with the hierarchy change log |
| Permissibility rules | Store, seeded with one rule | **Yes** — add and remove pairings |
| Relay configuration | Repository | No |
| Criteria and field guidance | Repository | No |

**The split is not about importance, it is about which ones have behaviour hanging off the edit.**
[BDR-0010](../bdr/0010-an-administrator-maintains-the-hierarchy.md) names add, rename, set-inactive
and the change log as **built**, and attaches a consequence to one of them: marking a department
inactive **revokes every in-flight authorization naming it**, and tells each submitter. That
fan-out is one of the more interesting things the system does, and it cannot be shown at all unless
somebody can set something inactive. The permissibility list is the same argument at lower cost —
[BDR-0007](../bdr/0007-one-project-many-resources.md) makes it *"data rather than code"* precisely
so a pairing can be added without a build, and the surface for adding one is a two-field form.

**The relay configuration and the criteria have no such consequence at the point of editing.** What
matters about them is their *content* — that the relay is the organization's own six stages, and
that each stage's criteria and field guidance are written by the role accountable for the judgement.
Both are true of a file in the repository. What an editing surface would add is the ability to
change them at runtime, and for criteria that is close to building a small CMS.

**Ownership is unchanged, and this is not a retreat from
[BDR-0002](../bdr/0002-the-cast-and-what-each-role-needs.md).** Criteria are still authored and
owned by the role accountable for the judgement rather than by whoever builds the form. What moves
is *where* the authoring happens — a reviewed change to a file, rather than a screen. The thing
BDR-0002 was protecting against is a developer inventing an approver's standards, and a file the
approver owns does not do that.

## Considered options

- **All four editable in the product.** The complete reading of the Administrator role, and it buys
  the single most striking demonstration this architecture can give: editing the relay in front of
  an audience and watching in-flight authorizations come back to approvers as **re-reviews**,
  exactly as [ADR-0004](0004-transition-log-and-global-relay-config.md) specifies. Rejected on cost.
  It is the first thing to build if the demo turns out to need more than it has.

- **None editable — everything seeded, with a read-only administrative view.** The cheapest option,
  and it guts BDR-0010 rather than economizing on it. A submitter blocked by a missing department
  would have nowhere to turn, which is the exact failure that decision exists to remove, and the
  revocation fan-out would have no way to be triggered live.

## Consequences

**ADR-0004's headline behaviour is proven but not demonstrable.** A relay configuration change
reaching work already in flight is covered by tests at the service seam
([ADR-0010](0010-the-service-module-is-the-seam.md)) and can be staged in seeded history, but
nobody can trigger it live. This is the accepted cost and it is worth stating plainly, because it
is the behaviour hardest to believe without seeing.

**The synthetic hierarchy fixture becomes a seed rather than the canonical data.** For a fixture it
stays canonical; for a running instance the store is authoritative the moment an Administrator
edits anything, and the two will diverge. `docs/reference/cas-hierarchy.md` needs that said in it.

**Seeding requires a transformation, not a load.** The fixture is still shaped as the source chart
was — charts, segments and units, in the CAS vocabulary that
[BDR-0004](../bdr/0004-the-classification-is-three-levels.md) retired. The store's shape is **legal
entity → division → department** with attributes inherited downward. Reshaping it is an
implementation task in its own right, and the place where #8's finding that *"a cost center code
does not identify a unit"* has to be resolved rather than carried.

**Relay configuration is read at each step from the file, not from the store**, so
[ADR-0004](0004-transition-log-and-global-relay-config.md)'s single global configuration is
literally single: one artifact, versioned, with the fixture generator and the router reading the
same one. There is no seeded copy that can drift from it.

**Two of the Administrator's four responsibilities have no surface in this prototype.**
[BDR-0010](../bdr/0010-an-administrator-maintains-the-hierarchy.md) gives the role the hierarchy,
the permissibility rules, the relay configuration and the insights dashboard. The role is
under-built here relative to its definition, deliberately — the definition is not narrowed to match.
