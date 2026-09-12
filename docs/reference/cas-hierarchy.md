# Synthetic CAS hierarchy

A fictional stand-in for the classification chart that the work authorization form's nine
manual-lookup fields are read from. It exists so that *"how does a user arrive at the correct
classification"* can be argued against something concrete.

**Canonical data:** [`cas-hierarchy.json`](cas-hierarchy.json). This document explains it.
Where the two disagree, the JSON wins.

> **Everything here is invented.** Calderis Aerospace does not exist. No entity name,
> cost-center code, CAS code, site, or disclosure classification in this dataset is copied
> from, derived from, or decodable back to any real organization. Any resemblance to a real
> company is coincidental.

## Why it exists

[Ticket #8](https://github.com/adam-flores/work-auth-process/issues/8) called for a synthetic
hierarchy that *preserves the shape of the real one without reproducing any of its content*,
so that [#9 — Resolving a CAS classification](https://github.com/adam-flores/work-auth-process/issues/9)
can prototype against a real-shaped tree rather than an idealised one.

The point is the **awkwardness**. A picker built against a clean four-level tree would prove
nothing, because the difficulty in the real process is not navigation — it is that the chart
resists being navigated at all. Every irregularity catalogued below is deliberate.

## Provenance

Shape transcribed by hand from a working reference document supplied by the process owner.
That document is sensitivity-labelled, is not in this repository, and never will be. It is
excluded by `.gitignore`.

| | |
|---|---|
| **Taken** | Structural properties only: how many charts there are, their differing layouts and code schemes, the depth of nesting, the *shape* of the code formats, which attributes are encoded visually rather than textually, and the kinds of irregularity present |
| **Not taken** | Entity names, cost-center codes, CAS codes, CAGE codes, site locations, disclosure classifications, footnote text — none of it, anywhere |

> **One field goes beyond the source's shape.** Each unit carries a `country`, and the source has
> **no country field** — it distinguishes foreign from domestic by text colour and nothing more
> (see *How attributes are encoded*). Every specific country here is invented, and one unit
> (`Crosstrade`) was left `null` by oversight rather than by design. Treat `foreign` as faithful and
> `country` as fabrication: a prototype that filters on specific countries demos something the real
> hierarchy cannot supply. Recorded by
> [BDR-0008](../bdr/0008-finding-a-department.md), which filters on foreign/domestic for this reason.

One characteristic of the source is worth recording because it *is* the problem: the workbook's
entire content is embedded screenshots. The whole file contains **five unique text strings**.
There is no machine-readable data in it at all.

## What the dataset contains

58 units across three charts, 17 of them foreign, spanning ten non-US countries.

| Chart | Layout | Code scheme | Units |
|---|---|---|---:|
| `CSG` — Calderis Structures Group | Segment-as-column | `12.GA1` | 28 |
| `CAL` — Calderis Avionics Ltd | Bracket tree, grouped by function | `L740` | 22 |
| `STD` — Calderis Aerospace Standalone | Flat list | `5120.GA1` | 8 |

### Levels

The form asks for four levels — group, segment, SBU, legal entity. The chart does not cleanly
supply four. What it supplies is:

```
chart  →  segment  →  unit
```

where **unit** (supply unit / service center) is the leaf carrying the legal entity, the cost
centers, and the disclosure treatment.

Whether *unit* answers the form's **SBU** field, its **legal entity** field, or both is an open
question. This dataset deliberately does **not** answer it — that is a decision for a ticket,
not a fixture.

## How attributes are encoded

Several attributes are carried **only** by formatting in the source. A reader has to decode a
colour or an icon to know the answer; there is no text to transcribe. The JSON records both the
decoded value and its original visual carrier.

| Carrier | Value | Means |
|---|---|---|
| Fill | blue-grey | Full CAS coverage; unit files its own Disclosure Statement |
| Fill | yellow | Modified CAS coverage |
| Fill | white | CAS-exempt |
| Fill | tan | No DS of its own; disclosed in another segment's DS |
| Text colour | red | Foreign entity |
| Text colour | black | Domestic entity |
| Cost-center ink | orange | Cost center shared with another segment |
| Icon | dot | Included in the Home Office DS, Parts I and V–VIII |
| Icon | star | Offshore shared-service center; allocated, not charged direct |
| Prefix | `*` | Disclosed in the named segment's DS |
| Prefix | `**` | Foreign affiliate permitted to contract outside its own segment |

Note that **fill and text colour are independent encodings**, and a third encoding rides on the
ink colour of an individual cost-center code inside a box. Three simultaneous colour channels,
none of them labelled.

## The messiness, catalogued

This is the part worth reading before prototyping against the data.

**Structural**

1. **Three charts that share no structure.** Different layouts, different code schemes,
   different grouping logic. Learning to read `CSG` does not teach you to read `CAL`. Before
   anything else, a user has to know *which chart to open* — and nothing tells them.
2. **The unaffiliated column is not a segment**, but it sits alongside the segments and its
   units are selectable.
3. **Depth is not uniform.** `CAL` groups by function (Labs, Centers of Excellence, Allocated
   Functions) rather than by segment at all.

**Identity**

4. **Near-identical sibling names.** `Rotor Hubs` / `Rotor Hubs - Pacific` /
   `Rotor Hubs - U.K.`; `Rotor Shaft Corp` / `Rotor Shafts Continental` /
   `Rotor Shafts Aldenmoor` / `Rotor Shafts Northline G&A` — note the singular/plural switch.
   `CAL Westmoor` / `CAL Westmoor Next Gen Display`. `Harrowgate Navigation Ltd` /
   `Harrowgate Navigation Ltd (Southbay)`, distinguished only by a parenthesised site.
5. **Inconsistent naming conventions.** Some units are legal names with suffixes (GmbH, Pty
   Ltd, Inc.), some are function descriptions (`Cabin Equipment - Central Engineering`), some
   are bare locations, one is a single word (`Crosstrade`).

**Codes**

6. **Cost centers do not identify units.** Three units in Thermal Systems share cost center
   `20514`. Two units share the pair `61237` / `4BQX7` but have *different* disclosure
   treatments.
7. **One unit, many cost centers.** `Inertial Reference Systems` carries six.
8. **Missing codes.** Several units have no CAS code, no cost center, or neither.
9. **Unresolvable codes.** Two `CAL` entries have the literal code `various cost centers`.
10. **Format inconsistency.** `T.GA1` and `NV410.GA1` sit among numeric siblings; `1617a.GA1`
    is a lettered suffix of `1617.GA1`, implying a relationship the chart never states.
11. **Transcription traps.** Cost center `OQB13` starts with a letter `O` that reads as a zero.

**Compliance**

12. **Foreign entities are scattered**, not grouped, and are flagged only by text colour. There
    is no foreign column and no country field.
13. **Four disclosure treatments**, distinguishable only by fill.
14. **Exceptions.** Four foreign affiliates carry `**` — permitted to contract outside their
    own segment. Three units carry `*` — no DS of their own. One `CAL` unit is excluded from
    government rate pools by a free-text annotation.

## What this dataset does not do

- **It does not decide the data store.** JSON was chosen for readability at this stage.
  [ADR-0003](../adr/0003-data-store-xml-or-sqlite.md) covers persistence of authorization
  lifecycle state, which is a different problem; static reference data does not settle it, and
  re-serializing 58 records is trivial.
- **It does not model the entered fields.** Trading partner number, finance/ERP entity code,
  and billing contact are *entered*, not looked up — the chart does not carry them. Their
  absence here is faithful, and is itself a finding: the chart cannot supply them, so
  something else must.
- **It does not resolve the group/segment/SBU mapping.** See *Levels* above.
