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

6. **Cost centers do not identify departments.** Three departments in Thermal Systems share cost
   center `20514`. Two share the pair `61237` / `4BQX7` but have *different* disclosure treatments.
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
  still here, because they are the point.
  [#49](https://github.com/adam-flores/work-auth-process/issues/49) is where they get resolved
  into the store, and it has to decide each one explicitly rather than carrying it.
