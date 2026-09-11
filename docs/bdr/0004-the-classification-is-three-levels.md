# BDR-0004: The classification is legal entity, division, department — and the submitter names both sides

**Status:** final
**Date:** 2026-09-11
**Decided by:** product owner

## Decision

An organizational unit is identified by **three levels — legal entity → division → department**.
Every department belongs to exactly one division; every division belongs to exactly one legal
entity. The **CAS vocabulary is retired**: group, CAS group, CAS segment, CAS SBU, chart, and
segment name nothing this project will use.

The **department is the unit that matters**. It is what an authorization requests work from, and
the two levels above it exist to disambiguate it, not to be chosen for their own sake.

The **submitter identifies both sides** — their own department and the department they are
requesting work from — and the two may never be the same, which is a validation rule rather than
a convention.

## Why this, and not the alternatives

This ticket asked which form field each chart level answers: the form named four levels, the chart
supplied three, and "unit" could plausibly have answered the SBU field, the legal-entity field, or
both. We expected an answer that assigned the labels.

We did not get one, and the reason is more useful than the answer would have been. **The question
assumed the chart's vocabulary was worth preserving, and it is not.** CAS terminology is
meaningful inside the company and meaningless outside it, so a prototype that reproduces it
inherits an encoding it cannot explain to anybody. The product owner replaced the model rather
than mapping it.

The alternative genuinely on the table was **faithful reproduction** — model the four form fields
as they stand, mismatch and all, on the grounds that a prototype proposing a different data model
is proposing a different process. It loses for two reasons. The mismatch is a defect of the
current form rather than a property of the organization, so reproducing it would be
[BDR-0001](0001-preserve-the-flow-rebuild-the-experience.md) misapplied: that decision preserves
the **approval sequence**, not every field label. And the four-into-three problem was never solved
by anyone — it is precisely the ambiguity the form imposes on its users, and carrying it forward
would preserve the disease as a feature.

A second alternative, **deriving the levels from the fixture**, is ruled out by the fixture's own
terms: `docs/reference/cas-hierarchy.json` deliberately declines to settle this, because a test
fixture should not quietly make a modelling decision.

## What it assumes

- **That three levels are sufficient to identify a department unambiguously.** The product owner
  described exactly this shape, but did not say whether two divisions under different legal
  entities can hold same-named departments. They did say department names are *"sometimes
  similar,"* which suggests collisions are near-misses rather than exact duplicates.
- **That the hierarchy is stable enough to be treated as reference data.** Stated as *"relatively
  static,"* subject to change through restructures and acquisitions. The consequences of it moving
  are [#30](https://github.com/adam-flores/work-auth-process/issues/30)'s to settle, not this
  record's.
- **That "division" carries no accounting meaning.** We have taken it as an organizational layer.
  If it inherits any of the cost-accounting significance the CAS segment carried, the model is
  thinner than it looks.
- **That the same three levels describe both sides.** Nothing in the answer distinguishes the
  requesting side's structure from the performing side's, and the form asked for the same fields
  on both.

## What this costs us, and what it does not

**The fixture built in [#8](https://github.com/adam-flores/work-auth-process/issues/8) no longer
models the target.** It faithfully reproduces the *chart* — three charts, no shared code scheme,
foreign status encoded only as text colour, cost centres shared between units, and no department
anywhere. That was an accurate rendering of the thing being replaced. It is not a rendering of
legal entity → division → department, and the product owner has said to build the table ourselves.
The fixture becomes historical; what it proved stays proven.

**The hard part of the lookup survives the simplification, and moves.** The obvious worry is that
defining our own clean three-level tree dissolves the problem the project exists to solve. It does
not. The difficulty was never only the chart's disorder — it is that **you are looking up a
department that is not yours**, whose name may closely resemble another, where picking the US
entity rather than the foreign one is the distinction that matters and is not visible in the name.
That difficulty is intrinsic to the task and is untouched by tidying the data.

What changes is that the difficulty becomes **addressable**. Filtering on attributes you are
certain of and searching what remains — the direction chosen in
[#9](https://github.com/adam-flores/work-auth-process/issues/9) — is a coherent answer to
"disambiguate a department you don't know" and was never a coherent answer to "decode three
incompatible charts."

**A vocabulary collision arrives with it.** `CONTEXT.md` defines *requesting entity* and
*performing entity* as departments, and this record introduces *legal entity* as the top level.
Two different things called "entity" is exactly the ambiguity this decision exists to remove, so
the glossary terms become **requesting department** and **performing department**. Older documents
are allowed to disagree; `CONTEXT.md` wins.

## What changes if this is overturned

Comfortably the cheapest of the four decisions on this map to reverse, because nothing is built on
it yet — it settles vocabulary and a shape, not a mechanism.

- **If a fourth level is needed**, the picker gains a filter and the record gains a field. The
  interaction direction survives untouched; filter-then-search does not care how many levels it
  filters on.
- **If three levels cannot identify a department uniquely**, the model needs a key that is not the
  name, and the classification stops being "choose a node" and becomes "choose a node, then
  disambiguate." That is a real change to [#9](https://github.com/adam-flores/work-auth-process/issues/9)'s
  design and the largest risk carried here.
- **If CAS vocabulary has to come back** — because a downstream finance consumer needs it — it
  returns as a *derived* attribute of a department rather than as something a user picks. The
  lookup task does not return with it.
