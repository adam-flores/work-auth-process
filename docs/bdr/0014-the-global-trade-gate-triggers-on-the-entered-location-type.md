# BDR-0014: The Global Trade gate triggers on the entered location type

**Status:** provisional
**Date:** 2026-09-14
**Decided by:** us — the question was withdrawn after failing to land three times

## Decision

**The Global Trade gate runs when the location types entered on the two sides differ, and is
skipped otherwise.** The trigger is the keyed field the source form already collects, and the
condition lives in the relay configuration like the Contracts gate's.

**Separately, and not in dispute: the approver sees everything.** Asked what the gate reads, the
product owner has twice answered that the export determination comes from a combination of fields
already on the authorization and that the approver should simply be given them all — which is
[BDR-0007](0007-one-project-many-resources.md)'s position and
[ADR-0005](../adr/0005-field-dependencies-drive-re-review.md)'s reason for keeping *shown* and
*judged* apart. The product derives no export determination of its own.

**Those are two different questions, and only the second has been answered.** What Global Trade
**reviews** is settled. What **routes** to it is not, and routing needs a boolean. This record
supplies it on our judgement.

**Why we are deciding rather than asking again.** The question has now been put three times — once
as part of the second round, once directly, and once during the build spec — and each time the
answer returned has been about the content of the review. A question that has not landed twice is
withdrawn and decided by us with the reason recorded; this is the third. Unlike the four questions
withdrawn in [BDR-0012](0012-a-wrong-department-is-a-new-authorization.md), **this one has a
consumer** — the router will not run without it — so it is decided rather than dropped.

## Why this, and not the alternatives

**Derive it from a country held on the department.** The cleanest model: the gate compares the two
departments' countries, nothing is keyed, and the record cannot contradict itself. Rejected because
it asks the organization for data the source does not hold. The reference document is explicit that
the real chart has **no country field** — it separates foreign from domestic by text colour alone —
and the countries in our synthetic fixture are invented, one of them `null`. Building the gate's
trigger on a field that exists only in our fiction would be the prototype demonstrating something
the organization cannot supply.

**Derive it from the foreign/domestic attribute.** Uses only what
[BDR-0008](0008-finding-a-department.md) establishes and keys nothing. Rejected because it answers
a different question than the gate asks. The gate's condition is whether the two sides are in
*different countries*; foreign/domestic can only tell you that one side is foreign and the other is
not. Two foreign departments in different countries would not trigger it, and that is an export
question going unasked — a real gap in a control, not a rounding error.

**Run the gate on every authorization.** Defensible on the reading that the determination needs a
human anyway, so why gate it. Rejected because it changes the flow, and
[BDR-0001](0001-preserve-the-flow-rebuild-the-experience.md) preserves the sequence exactly. The
source is unambiguous that Global Trade is conditional and has a skip branch.

## What it assumes

**That the entered location type is accurate.** It is keyed by the submitter, and this is the
weakest joint. The **department picker** exists precisely to stop people transcribing what can be
derived, so keeping one keyed field that determines whether a compliance gate runs sits awkwardly
beside it — a submitter can pick a foreign department and key *domestic*, and nothing in the
product would notice.

**That the source form's location type means the site's country** rather than something narrower.
Two values, domestic and international, are what the source collects.

**That the gap is acceptable for a prototype.** Where the entered value and the department's
foreign/domestic attribute disagree, the product believes the entered value. A real build should
almost certainly reconcile them or derive the trigger outright.

## Question for the product owner

Kept here rather than in `docs/open-questions.md` because it is not something to go and look up —
it needs a direction, and the build proceeds without one.

**When Global Trade's step says the two sides are in different countries, what does the product
look at to know that?** The choices are the location type each side keys today, or something
carried by the department itself. If it is the department, we need to know whether the real
hierarchy can say what country a department is in, because the reference chart cannot.

## What changes if this is overturned

Small, and deliberately so. The gate's condition is one expression in the relay configuration, and
changing what it reads is a configuration edit rather than a rebuild — which is the property
[ADR-0004](../adr/0004-transition-log-and-global-relay-config.md) exists to preserve. If the
trigger moves onto the department, the two keyed location-type fields leave the form and the
hierarchy gains a country attribute, which also affects the picker's filters.
