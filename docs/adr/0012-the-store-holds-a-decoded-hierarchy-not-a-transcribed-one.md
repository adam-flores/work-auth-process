# The store holds a decoded hierarchy, not a transcribed one

**Status:** accepted, superseded in part
**Superseded in part by:** [ADR-0013](0013-the-demo-catalog-is-the-seed.md)

> **Read this first.** [ADR-0013](0013-the-demo-catalog-is-the-seed.md) replaced what actually
> seeds a running store — a small, freshly-authored demo catalog now stands in for
> `docs/reference/organization-hierarchy.json`. The seeding **mechanism** this record decides
> (deterministic ids, the attribute/detail split, inactive-for-unclassifiable data) is unaffected
> and remains the contract for any hierarchy seed, demo catalog included. What no longer holds is
> the **content** below that is specific to the transcribed 58-department fixture — the cost-centre
> collision, the two departments sharing disclosure treatments, the CAL-specific transcription
> traps. That content stays accurate as a record of the fixture, which remains in the repository
> for exactly that reason (ADR-0013); it is simply no longer what the running store contains.

[ADR-0011](0011-reference-data-in-the-store-configuration-in-the-repo.md) settled that the
hierarchy lives in the store, seeded from `docs/reference/organization-hierarchy.json`, and that
*"seeding requires a transformation, not a load"* — naming this as the place where
[#8](https://github.com/adam-flores/work-auth-process/issues/8)'s finding that *"a cost center code
does not identify a unit"* has to be **resolved rather than carried**. This records what the
transformation decides. The fixture is unchanged by it: it is an input, and it stays as awkward as
it is.

**Identity is ours, and no code is ever an identifier.** Every node gets a deterministic id derived
from its name — `rotor-hubs`, `csg-rotor-assemblies`, `csg` — and a collision is thrown at seeding
rather than merged. This is #8's finding settled: in this data one cost centre is carried by **four**
departments in the same division, and two departments carry an identical cost-centre pair with
*different* disclosure treatments. A code cannot address a department, so nothing addresses a
department by one. Ids are derived from names rather than minted as opaque values because a
deterministic id is what makes re-seeding from empty produce the same hierarchy, which is what a
disposable store ([ADR-0008](0008-sqlite-for-the-prototype-store.md)) needs. A rename therefore does
not change an id — the id is a seeding artifact, not a slug the product shows anyone.

**An attribute is level-agnostic, inherited downward, and narrows the list. Everything else is
detail.** [BDR-0008](../bdr/0008-finding-a-department.md) makes attributes the picker's primary
affordance and explicitly rejects filtering on the cost-accounting fields, because each is blank for
a third of the organization and *"a filter that is blank for a third of the organization misleads
more than it narrows."* So the transformation sorts what the fixture carries into two kinds, and the
store's shape enforces the difference:

| Kind | Where it lives | What it is for |
|---|---|---|
| **Attribute** | `hierarchy_attributes`, keyed by level and node | Narrowing. Held at whatever level holds it; a department reads its own plus every one above it |
| **Detail** | Columns on `departments`, rows in `department_codes` | Recording and display. Never filtered on, never an identifier, never load-bearing |

Five attributes come out of this fixture, and one of them genuinely hangs at two different levels —
which is the whole of what BDR-0008 means by attributes not being tied to one:

| Attribute | Values | Held at | From |
|---|---|---|---|
| `affiliation` | `affiliated`, `standalone` | legal entity | the entity's own field |
| `home-office-disclosure` | `included` | **division and department** | the home-office dot icon |
| `jurisdiction` | `foreign`, `domestic` | department | the `foreign` flag |
| `offshore-shared-service` | `allocated` | department | the star icon |
| `contracting-exception` | `outside-own-division` | department | footnote `fn-2` |

Detail is the heritage marker, the disclosure treatment, and the codes — each code tagged
`cost-accounting` or `cost-centre`, with the source's shared-with-another-division marking kept as a
flag on the code rather than as an attribute of the department.

**Foreign and domestic survives as an attribute; the invented geography does not.** `jurisdiction`
is the one compliance attribute the source genuinely encodes, and it is what the seeded
permissibility rule is evaluated against. The per-department `country` and the per-division `site`
in the fixture are **not carried at all.** Both are invented enrichment the reference document
already labels as such — *"treat `foreign` as faithful and `country` as fabrication"* — and BDR-0008
is explicit that *"anything finer would demo a capability the real hierarchy cannot supply."*
[BDR-0014](../bdr/0014-the-global-trade-gate-triggers-on-the-entered-location-type.md) removes the
last consumer by having the Global Trade gate trigger on the **entered** location type rather than
on the hierarchy.

**Nothing is invented, and a department the fixture cannot classify is seeded inactive.** One
department carries no `foreign` value at all. Defaulting it would mean inventing a compliance
attribute for the exact field a control is read from, so it is seeded with no `jurisdiction` and
**inactive** — closed to new authorizations, permanently resolvable, and visible to an Administrator
as the gap it is. That is [BDR-0010](../bdr/0010-an-administrator-maintains-the-hierarchy.md)'s
inactive doing the work it was defined for, rather than a new state or a silent guess.

**The decoded value is carried; the carrier is not.** The fixture records both the decoded value and
the colour, fill or icon that carried it in the source. The store keeps only the value, and three
rules follow from that:

- **Where the two disagree, the decoded field wins.** One department is flagged `foreign` while its
  text colour says domestic; the flag wins, because the reference document names `foreign` as the
  faithful field.
- **Where the decoded field is empty and the colour is not, nothing is read from the colour.** Seven
  departments have a white fill, which the fixture's encoding table reads as *exempt*, and no
  disclosure treatment. The fixture sets both together elsewhere, so setting only the fill is an
  absence rather than an exemption, and the store records no treatment for those seven. This is the
  same refusal to invent that seeds the unclassifiable department inactive.
- **Where the carrier is the *only* record of a fact, decoding it is exactly this rule, not an
  exception to it.** The home-office dot and the star have no textual counterpart anywhere in the
  source, so what the store holds is the fact under a domain name —
  `home-office-disclosure=included`, `offshore-shared-service=allocated` — and never the string
  `home-office-dot`.

Recording a carrier as itself would put the source document's presentation into the product's
reference data, and the presentation is the problem this project is removing.

**One field is dropped for disagreeing with the encoding the fixture documents.** Divisions in two of
the three legal entities carry a `homeOfficeLevel` boolean, absent from the third entirely, which no
part of the fixture gives a meaning to — and on one division it is `true` while the home-office dot
the encoding table *does* define is absent. The documented carrier is read and the undocumented
boolean is not, which costs that division's departments the attribute (see Consequences).

**Sharing is computed, not copied.** The source marks a shared cost centre by the ink colour of the
individual code, and in this data the marking is simply wrong: four departments carry cost centre
`20514` and every one of them is marked as holding it *alone*, as are the two carrying an identical
pair. Whether a code is held by more than one department is a property of the whole transformed set
rather than of one row, so the transformation computes it — a code carried by several departments is
marked shared whatever the source said, and a code the source marked shared stays shared even where
the fixture holds only one of its holders. This is #8's finding applied to the codes themselves and
not only to identity: without it the store would assert four separate departments each hold `20514`
on their own.

**Which legal entity a department sits in narrows the list as structure, not as an attribute.**
BDR-0008 calls the three charts *"an attribute with three values, so narrowing on it is one filter
among many rather than a gate before the task begins"*, and that is exactly what a submitter gets:
legal entity and division are filters alongside the attributes, with no order imposed and none
required. They are not copied into attribute rows as well, because the tree already records them and
a second copy could disagree with the first.

**Three levels always, whatever the source called them.** A grouping is a division even where the
source grouped by function rather than by division, and even where it rendered the grouping as a
column it declined to call a division at all. This is
[BDR-0004](../bdr/0004-the-classification-is-three-levels.md) applied uniformly, and it is the one
place the transformation loses a distinction the source drew: the *unaffiliated* column becomes an
ordinary division, and only its name says otherwise. Its departments were always selectable, so
nothing a user can do changes.

**Reference data is deleted by nobody.** Every level carries an `active` flag, the command surface
offers no delete at any level, and inactive at one level closes everything beneath it — a department
under a closed division is not selectable even though its own flag still says active, and it says
which level closed it. BDR-0010 requires exactly this: *"Inactive means closed to new authorizations
while remaining permanently resolvable, so no existing record can point at something that has ceased
to exist. The same holds at every level."*

## Considered options

- **Carry the fixture through unchanged and let the picker cope.** Rejected as the thing ADR-0011
  already ruled out. The three legal entities differ in *shape*, not only in values — CAL's
  departments carry a single conflated code column and none of the cost-accounting fields the other
  two spell out, and its divisions carry only a name — so every consumer would reimplement the
  reconciliation, differently.

- **Cost centre as an attribute, so a submitter who knows a code can filter on it.** Rejected on the
  data, which is also how BDR-0008 rejected it. A filter whose value is shared by four departments
  does not narrow to one, and the two departments sharing an identical pair have different
  disclosure treatments — so the code that looks most like an answer is the one most likely to be
  the wrong one. Codes are still recorded and shown, because a submitter reading a form against a
  chart wants to recognise them; they simply cannot be relied on.

- **Keep `country` as a non-filterable detail rather than dropping it.** The cheap middle path, and
  rejected because non-filterable reference data with no consumer is data waiting to be filtered on
  by somebody who did not read this record. It is still in the fixture, so restoring it is a change
  to the transformation and nothing else — the option to reach for if a country ever earns a
  consumer.

- **Default the unclassifiable department to domestic**, on the grounds that its text colour is
  black. Rejected: the fixture's own note calls it *"unresolvable from the chart alone"*, the colour
  is the carrier this record declines to read, and the value would be invented precisely where a
  control reads it.

- **Codes keyed to a department as its identifier**, with the shared ones disambiguated by division.
  Rejected as #8's finding restated rather than resolved. The four departments sharing a cost centre
  are in the *same* division.

## Consequences

**The picker has five attributes to narrow on, and one of them proves the inheritance rule.** A
department that holds nothing of its own is still reachable by an attribute its division holds,
which is the case [#50](https://github.com/adam-flores/work-auth-process/issues/50) has to get right
and the case a cascading level-by-level picker could not express.

**Permissibility has the attribute it needs and one department it cannot evaluate.** The seeded rule
— a foreign department may not perform work for a domestic one — reads `jurisdiction`. The one
department without it is inactive, so the rule is never asked a question it cannot answer.

**The reference document and the fixture disagreed, and the fixture was right.** Both said three
departments share cost centre `20514`; four do. Corrected in both places as part of this work, and
worth recording as the kind of error hand-transcribed reference data carries — the same class of
error the product exists to remove.

**One division's departments cannot be narrowed on home-office disclosure.** `Cabin Equipment` is the
division whose `homeOfficeLevel` boolean says `true` while the documented icon is absent, and none of
its departments carries the icon either — so none of them is reachable by that filter. That is the
price of reading the documented carrier rather than the undocumented field, and it is the right way
round: a filter is a claim about the organization, and the fixture gives no defensible basis for
making this one here. Reversing it is a one-line change to the transformation if the boolean ever
acquires a meaning.

**Two facts in the fixture are dropped with no replacement**: the footnote marking one department's
costs as excluded from government rate pools, and the fixture's per-record notes cataloguing its own
irregularities. Neither has a consumer, and the notes are commentary about the fixture rather than
facts about the organization. They stay in the fixture, which is where a reader looking for them
would go.

**An id is not a name and a rename does not move it.** Ids are derived from names once, at seeding.
An Administrator renaming a department later changes the name and not the id, which is what makes
BDR-0010's rename exemption cheap — but it does mean an id can end up looking nothing like the name
beside it. Acceptable because no user ever sees one.
