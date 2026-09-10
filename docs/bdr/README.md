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
3. Put that question to the product owner when access allows.
4. Confirmed → `final`. Overturned → `superseded`, and a new BDR carries the replacement.

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
