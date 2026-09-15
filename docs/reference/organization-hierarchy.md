# Synthetic organization hierarchy

A fictional stand-in for the classification chart that the work authorization form's nine
manual-lookup fields are read from. It exists so that *"how does a user arrive at the correct
classification"* can be argued against something concrete.

**Canonical seed:** [`organization-hierarchy.json`](organization-hierarchy.json). This document
explains it. Where the two disagree, the JSON wins.

> **This file is a seed, not the store.**
> [ADR-0011](../adr/0011-reference-data-in-the-store-configuration-in-the-repo.md) has the product
> read a hierarchy held in its own store, transformed from this file. From the first Administrator
> edit the store is authoritative for a running instance, and this file stays as it is. It was
> canonical data before the product had a store of its own; it is an input now.

> **Everything here is invented.** Calderis Aerospace does not exist. No entity name,
> cost-center code, CAS code, site, or disclosure classification in this dataset is copied
> from, derived from, or decodable back to any real organization. Any resemblance to a real
> company is coincidental.

> **The vocabulary was rewritten on 2026-09-14.** This document and the JSON beside it were
> written before [BDR-0004](../bdr/0004-the-classification-is-three-levels.md) retired the source
> chart's vocabulary, and used *chart*, *segment* and *unit* throughout. They now use **legal
> entity**, **division** and **department**, which is the same three levels under the names this
> project actually uses — BDR-0004 supplies the mapping and
> [BDR-0008](../bdr/0008-finding-a-department.md) established that the three charts are the three
> legal entities. The **Provenance** section below is the deliberate exception and still speaks of
> charts and CAS codes, because it records what was and was not taken from a sensitivity-labelled
> source document, and that record has to stay accurate about the source rather than about us.
> Nothing about the data changed: 58 departments, 12 divisions, 3 legal entities, and every
> irregularity catalogued below is exactly where it was.

## Why it exists

[Ticket #8](https://github.com/adam-flores/work-auth-process/issues/8) called for a synthetic
hierarchy that *preserves the shape of the real one without reproducing any of its content*,
so that [#9](https://github.com/adam-flores/work-auth-process/issues/9) could prototype against a
real-shaped tree rather than an idealised one.

The point is the **awkwardness**. A picker built against a clean tree would prove nothing, because
the difficulty in the real process is not navigation — it is that the source resists being
navigated at all. Every irregularity catalogued below is deliberate.

## Provenance

Shape transcribed by hand from a working reference document supplied by the process owner.
That document is sensitivity-labelled, is not in this repository, and never will be. It is
excluded by `.gitignore`.

**This section describes the source document, so it keeps the source's own words.**

| | |
|---|---|
| **Taken** | Structural properties only: how many charts there are, their differing layouts and code schemes, the depth of nesting, the *shape* of the code formats, which attributes are encoded visually rather than textually, and the kinds of irregularity present |
| **Not taken** | Entity names, cost-center codes, CAS codes, CAGE codes, site locations, disclosure classifications, footnote text — none of it, anywhere |

> **One field goes beyond the source's shape.** Each department carries a `country`, and the source
> has **no country field** — it distinguishes foreign from domestic by text colour and nothing more
> (see *How attributes are encoded*). Every specific country here is invented, and one department
> (`Crosstrade`) was left `null` by oversight rather than by design. Treat `foreign` as faithful and
> `country` as fabrication: a prototype that filters on specific countries demos something the real
> hierarchy cannot supply. Recorded by
> [BDR-0008](../bdr/0008-finding-a-department.md), which filters on foreign/domestic for this reason.

One characteristic of the source is worth recording because it *is* the problem: the workbook's
entire content is embedded screenshots. The whole file contains **five unique text strings**.
There is no machine-readable data in it at all.

## What the dataset contains

58 departments across three legal entities, 17 of them foreign, spanning ten non-US countries.

| Legal entity | Layout | Code scheme | Departments |
|---|---|---|---:|
| `CSG` — Calderis Structures Group | Division-as-column | `12.GA1` | 28 |
| `CAL` — Calderis Avionics Ltd | Bracket tree, grouped by function | `L740` | 22 |
| `STD` — Calderis Aerospace Standalone | Flat list | `5120.GA1` | 8 |

### Levels

Three levels, and the **department** is the leaf — it carries the cost-accounting code, the cost
centers, and the disclosure treatment.

```
legal entity  →  division  →  department
```

The form asked for four lookup levels against the source's three, and which field each level
answered was open for a long time.
[BDR-0004](../bdr/0004-the-classification-is-three-levels.md) closed it by replacing the model
rather than mapping the four onto the three: there are three levels, and the source's vocabulary is
retired. [BDR-0008](../bdr/0008-finding-a-department.md) then established that the three charts are
the three **legal entities**, which is what makes the mapping above exact rather than approximate.

## How attributes are encoded

Several attributes are carried **only** by formatting in the source. A reader has to decode a
colour or an icon to know the answer; there is no text to transcribe. The JSON records both the
decoded value and its original visual carrier.

| Carrier | Value | Means |
|---|---|---|
| Fill | blue-grey | Full cost-accounting coverage; department files its own Disclosure Statement |
| Fill | yellow | Modified cost-accounting coverage |
| Fill | white | Exempt from cost-accounting coverage |
| Fill | tan | No DS of its own; disclosed in another division's DS |
| Text colour | red | Foreign entity |
| Text colour | black | Domestic entity |
| Cost-center ink | orange | Cost center shared with another division |
| Icon | dot | Included in the Home Office DS, Parts I and V–VIII |
| Icon | star | Offshore shared-service center; allocated, not charged direct |
| Prefix | `*` | Disclosed in the named division's DS |
| Prefix | `**` | Foreign affiliate permitted to contract outside its own division |

Note that **fill and text colour are independent encodings**, and a third encoding rides on the
ink colour of an individual cost-center code inside a box. Three simultaneous colour channels,
none of them labelled.

## The messiness, catalogued

This is the part worth reading before prototyping against the data.

**Structural**

1. **Three legal entities that share no structure.** Different layouts, different code schemes,
   different grouping logic. Learning to read `CSG` does not teach you to read `CAL`. In the
   source, a user had to know *which chart to open* before anything else — and nothing told them.
   BDR-0008 is what dissolved that: the three charts are an **attribute with three values**, so
   narrowing on it is one filter among many rather than a gate before the task begins.
2. **The unaffiliated column is not a division**, but it sits alongside the divisions and its
   departments are selectable.
3. **Depth is not uniform.** `CAL` groups by function (Labs, Centers of Excellence, Allocated
   Functions) rather than by division at all. Under BDR-0004 the middle level is a division
   regardless of how the source chose to group it, so it is modelled as one.

**Identity**

4. **Near-identical sibling names.** `Rotor Hubs` / `Rotor Hubs - Pacific` /
   `Rotor Hubs - U.K.`; `Rotor Shaft Corp` / `Rotor Shafts Continental` /
   `Rotor Shafts Aldenmoor` / `Rotor Shafts Northline G&A` — note the singular/plural switch.
   `CAL Westmoor` / `CAL Westmoor Next Gen Display`. `Harrowgate Navigation Ltd` /
   `Harrowgate Navigation Ltd (Southbay)`, distinguished only by a parenthesised site.
5. **Inconsistent naming conventions.** Some departments are legal names with suffixes (GmbH, Pty
   Ltd, Inc.), some are function descriptions (`Cabin Equipment - Central Engineering`), some
   are bare locations, one is a single word (`Crosstrade`).

**Codes**

6. **Cost centers do not identify departments.** Four departments in Thermal Systems share cost
   center `20514` — this document and the fixture's own note said three until
   [#49](https://github.com/adam-flores/work-auth-process/issues/49) counted them, which is itself
   the kind of error hand-transcribed reference data carries. Two departments share the pair
   `61237` / `4BQX7` but have *different* disclosure treatments.
7. **One department, many cost centers.** `Inertial Reference Systems` carries six.
8. **Missing codes.** Several departments have no cost-accounting code, no cost center, or neither.
9. **Unresolvable codes.** Two `CAL` entries have the literal code `various cost centers`.
10. **Format inconsistency.** `T.GA1` and `NV410.GA1` sit among numeric siblings; `1617a.GA1`
    is a lettered suffix of `1617.GA1`, implying a relationship the source never states.
11. **Transcription traps.** Cost center `OQB13` starts with a letter `O` that reads as a zero.

**Compliance**

12. **Foreign departments are scattered**, not grouped, and are flagged only by text colour. There
    is no foreign column and no country field.
13. **Four disclosure treatments**, distinguishable only by fill.
14. **Exceptions.** Four foreign affiliates carry `**` — permitted to contract outside their
    own division. Three departments carry `*` — no DS of their own. One `CAL` department is
    excluded from government rate pools by a free-text annotation.

## What seeding does to it

[ADR-0011](../adr/0011-reference-data-in-the-store-configuration-in-the-repo.md) has the product read
a hierarchy held in its own store, transformed from this file, and
[ADR-0012](../adr/0012-the-store-holds-a-decoded-hierarchy-not-a-transcribed-one.md) records what the
transformation decides and why. Summarised here so a reader of the fixture knows what the product
does and does not see.

**Nothing about this file changes.** It is an input. The store diverges from it at the first
Administrator edit, and this file stays as it is.

**What the store keeps**

| From the fixture | In the store | As |
|---|---|---|
| the three levels | `legal_entities` → `divisions` → `departments` | one parent each, with an `active` flag at every level |
| `foreign` | `jurisdiction` = `foreign` \| `domestic` | an **attribute**, held at the department |
| the entity's `affiliation` | `affiliation` | an attribute, held at the **legal entity** and read by every department below it |
| the home-office dot icon | `home-office-disclosure` | an attribute, held at the **division** for some and at the **department** for others |
| the star icon | `offshore-shared-service` | an attribute, held at the department |
| footnote `**` | `contracting-exception` | an attribute, held at the department |
| `costAccountingCode`, `costCentres`, CAL's `code` | one code list per department, each tagged by kind | **detail**: recorded and shown, never filtered on, never an identifier |
| `heritage`, `disclosureStatement` | columns on the department | detail |

An **attribute** narrows the picker and is inherited downward, so a department carries its own plus
every attribute above it. **Detail** is recorded and displayed and nothing depends on it. Which is
which follows [BDR-0008](../bdr/0008-finding-a-department.md), where filtering on the
cost-accounting fields is rejected because each is blank for a third of the organization.

**How each irregularity is resolved**

| Irregularity | Resolution |
|---|---|
| A cost center shared by four departments; two departments with an identical pair | Identity is a deterministic id of the product's own. No code identifies anything, and both departments keep their own disclosure treatment |
| Every one of those four marked as holding `20514` **alone** | Sharing is computed from the transformed set, not copied from the ink colour: a code several departments carry is marked shared whatever the source said, and a code the source marked shared stays shared |
| Departments with no code at all | Absent, not blank. A department with no code is as selectable as one with seven |
| The literal code `various cost centers` | Not carried. A code with a space in it is prose rather than a code, so the rule is general and names nothing |
| Three codes in one field (`D204, D209, D216`) | Three codes |
| A cost center marked as shared with another division | Kept as a flag on the code, not as an attribute of the department |
| The `null` country, and every other country | **Not carried at all.** The countries are invented enrichment the source cannot supply, so a missing one is not a gap. `foreign`/`domestic` is what the source encodes and what the store holds |
| The one department with no `foreign` value either | Seeded **inactive**: no jurisdiction is invented for the field a compliance rule is read from, and an inactive department is closed to new work while staying resolvable for ever |
| One department flagged `foreign` whose text colour says domestic | The flag wins. This document names `foreign` as the faithful field, and the colour is a carrier the store does not read |
| Seven departments with a white fill (*exempt*) and no `disclosureStatement` | No treatment is recorded. The fixture sets both together elsewhere, so a fill on its own is an absence rather than an exemption, and nothing is read from the colour |
| One division marked `homeOfficeLevel: true` with no home-office dot | The documented icon is read and the undocumented boolean is not, so that division's departments carry no `home-office-disclosure` at all — recorded as the price of not inventing a filter |
| The unaffiliated column that is not a division | An ordinary division. Its departments were always selectable; only the name now says it is unaffiliated |
| Three legal entities of different *shape*, not just different values | Reconciled once, at seeding. `CAL`'s single code column is read as the cost-accounting code its own chart declares as that entity's code scheme |
| Near-identical sibling names | Distinct departments, distinct ids. Nothing is merged, and a collision would fail seeding rather than pass quietly |

**What is dropped, deliberately:** the countries and division sites (invented geography); `fill`,
`textColour` and cost-center ink colour (carriers, read only where the fixture gives no decoded field
of its own — and never read to fill a decoded field the fixture left empty); `homeOfficeLevel` (a
boolean the fixture never gives a meaning, absent from one legal entity entirely, and contradicted by
the documented icon on one division); the source's layout and code-scheme notes and the division
codes (properties of the source document);
footnote `fn-1` (identical in meaning to the disclosure treatment already kept) and `fn-3`; and the
per-record `note` fields, which are commentary about this fixture rather than facts about the
organization. All of it stays here, which is where a reader looking for it would come.

## What this dataset does not do

- **It does not decide the data store.** JSON was chosen for readability at this stage, and the
  store was settled separately as SQLite
  ([ADR-0008](../adr/0008-sqlite-for-the-prototype-store.md), superseding ADR-0003).
- **It does not model the entered fields.** Trading partner number, finance/ERP entity code,
  and billing contact are *entered*, not looked up — the source does not carry them. Their
  absence here is faithful, and is itself a finding: the source cannot supply them, so
  something else must.
- **It does not resolve every irregularity.** The vocabulary is now the product's, but the
  awkwardness is not cleaned up: shared cost centers, missing codes and the `null` country are all
  still here, because they are the point. Resolving them is *seeding's* job, not this file's —
  see **What seeding does to it** above.
