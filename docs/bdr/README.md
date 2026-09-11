# Business Decision Records (BDRs)

Decisions about **the process and the product** — what the system should do, for whom, and
why — recorded so the group can refer back to them and so it stays visible which decisions
are validated and which are still our own assumptions.

## BDR or ADR?

Two records folders, one boundary:

| | `docs/bdr/` | `docs/adr/` |
|---|---|---|
| **Answers** | What should the system do, and why? | How is the system built, and why? |
| **Owned by** | The business — ultimately the product owner | The engineering team |
| **Examples** | When a charge number is issued; whether rework returns to the originator or to a field; which measures the prototype reports | Data store choice; front-end framework; diagram format |

If a decision would still matter to someone who never sees the code, it's a BDR. If it only
matters to someone reading the code, it's an ADR. When a decision is genuinely both, write the
BDR and let the ADR reference it — the business reason drives the technical one, not the
reverse.

## Status

Every BDR carries exactly one status.

- **`provisional`** — decided by us, on our own judgement, without confirmation from the
  process owner. Good enough to build on, not good enough to assert. Every provisional BDR
  states the question we would put to the product owner.
- **`final`** — confirmed with the product owner. The decision stands as written.
- **`superseded`** — we were wrong, or the product owner decided otherwise. The record stays,
  with a pointer to the BDR that replaced it. We do not rewrite a provisional decision in
  place; what we assumed, and why it was wrong, is the most useful part of the record.

## The two waves

**v0.1** is built on provisional decisions — our best reading of the process, made so the work
can proceed rather than stall on access to stakeholders.

**v1.0** is v0.1 with the assumptions that came back wrong corrected. It is *not* a rebuild,
and it is not gated on every BDR reaching `final`. It is declared when no outstanding
provisional decision would change the build — a provisional decision that gets confirmed
unchanged has no release implication and should not hold one up.

## Lifecycle

1. A decision is reached — usually by resolving a wayfinder ticket.
2. Write the BDR as `provisional`, including the question for the product owner.
3. **Update [`docs/business-case.md`](../business-case.md) to match** — see below. This is
   part of making the decision, not a follow-up.
4. Put that question to the product owner when access allows.
5. Confirmed → `final`. Overturned → `superseded`, and a new BDR carries the replacement.

## Relationship to the business case

[`docs/business-case.md`](../business-case.md) is the **live argument** — the standing case a
product owner or an assessor actually reads. It is not a snapshot, and it is not source
material; the original it superseded is history, kept at
[`docs/source/BUSINESS_CASE.md`](../source/BUSINESS_CASE.md).

**A BDR is not finished until the business case reflects it.** The BDR holds the reasoning and
the alternatives; the business case states the resulting position, in one or two sentences, and
links to the BDR. Where a decision lands there varies:

| What the decision did | Where it shows up |
|---|---|
| Changed what the product does | §6 Solution Direction |
| Rested on a belief about the process | §10 Assumptions — say it is load-bearing if it is |
| Ruled something out, or deferred it | §11 Out of Scope, with the reason |
| Produced a question for the product owner | §12 Open Questions |

A decision that changes nothing in any of those is worth a second look: either it is smaller
than it seemed, or the business case is missing a section it should have.

Terms the decision settles go to [`CONTEXT.md`](../../CONTEXT.md) instead. The business case
argues; the glossary defines; the BDR explains. Nothing is restated in two of them.

## Relationship to the wayfinder map

The map on the issue tracker is the **working** surface: its tickets are where decisions get
argued out, and it is closed and archived as the effort completes. BDRs are the **durable**
surface: what the group and the final deliverable actually read.

To keep one canonical text, a ticket's resolution comment states the decision in a line and
links to its BDR for the reasoning. The BDR holds the detail; nothing restates it.

## Conventions

- Filename: `NNNN-short-kebab-title.md`, numbered sequentially from `0001`.
- Use [`0000-template.md`](0000-template.md).
- Markdown, wrapped around 95 characters.
- No real company data — no entity names, contract numbers, program names, employee names, or
  cost figures. Use synthetic or clearly fictional examples.
- Don't invent metrics or baselines. Unknown values stay `TBD`.
