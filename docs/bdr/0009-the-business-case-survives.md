# BDR-0009: The business case survives the process being administrative; the controls get named

**Status:** final
**Date:** 2026-09-12
**Decided by:** product owner

## Decision

The process being **administrative record-keeping rather than approval**
([BDR-0005](0005-correction-in-place-and-revocation.md)) changes **no target and no claim** in
`docs/business-case.md`. Both headline targets stand exactly as written — **50%** cycle time,
**25%** submission errors — and the root-cause framing in §3 stands intact. What changes is that
the document stops describing its controls abstractly and **names them**.

### The targets stand

The 50% target never rested on the relay rendering judgement. It rests on the time being lost
inside the steps rather than in the count of them, which is unaffected by what the steps are *for*.
The administrative framing, if anything, makes the target easier to defend — a stage that neither
approves nor refuses has no deliberation to protect, so days spent in one are days spent waiting —
but the target does not need the help and is not restated to lean on it.

The 25% error target likewise stays **broad**, measured over all correction requests. It is
**not** narrowed to department errors, even though the process owner names *"getting the
departments right"* as the error that matters and the solution concentrates there. Narrowing the
headline measure to the one field we already expect to move would be choosing the metric for the
result, and it would force M1 and M3 to be redefined for no gain. Departments are named in the
*argument* — as the dominant error and the reason the target is reachable — and not in the target.

### The controls get named

This is the substantive change. §2 previously gave three control functions in the abstract, the
third of which — *"the form is what permits cross-departmental work to begin"* — reads as approval
and is contradicted by §6. Describing a control without naming it leaves a reader nothing to act
on. §2 now names the five controls that actually operate, each traceable to where it is defined:

| Control | What it is | Where it reads its condition |
|---|---|---|
| **Permissibility rule** | A configured list of department pairings that may not work together, checked at entry | The two departments on the authorization ([BDR-0007](0007-one-project-many-resources.md)) |
| **Contracts gate** | A conditional stage testing consistency with the funding contract's terms | The **funding type** the requesting side supplies at intake — Commercial, FAR 12, FAR 15 |
| **Global Trade gate** | A conditional stage testing that scope matches the declared export jurisdiction and classification | The **location type** entered on each side |
| **Classification** | Three levels per side, identifying the department the cost is allocated to | The department picker ([BDR-0004](0004-the-classification-is-three-levels.md), [BDR-0008](0008-finding-a-department.md)) |
| **Four mandatory acknowledgements** | A program manager and a finance approver on each side | Nothing conditional; they always run |

The first three are what *stop what is not legally allowed to happen*. The fourth is what *keeps
the ledger honest*. The fifth is what ensures nothing is assigned to an area without someone there
knowing — which is a control over surprise, not over permission.

Permission to **do** the work is granted elsewhere, through mechanisms outside this process
entirely. What this process controls is whether the hours can be **booked**, and against whom.
That is a divergence from [the source brief](../source/project-overview.md), which describes the
form as what permits work to begin, and it is flagged in §2 rather than smoothed over — the brief
is a source document and is not edited, but the business case is ours and must not open with a
framing its own §6 overturns.

### "Approver" is kept

The role stays **Approver** even though no approver approves. `CONTEXT.md` already carries the
precision where it counts: the act is an **acknowledgement**, the refusal is a **revocation**, and
the objection is a **correction request**. Only the noun is inherited, and it is the noun the
organization's own people answer to. Renaming it *Acknowledger* would buy consistency the verbs
already deliver, at the cost of inventing a word nobody in the business says and rewriting six
BDRs, two ADRs, the glossary and this document.

What was missing was not the rename but the **reason**, without which "Approver" quietly
re-imports refusal semantics for every new reader. `CONTEXT.md` now records why the name is
retained, so the inconsistency is deliberate and documented rather than latent.

## Why this, and not the alternatives

**Rewriting the cycle-time argument onto the administrative framing** was considered and rejected.
The reasoning was that assumption 1 — *most of today's elapsed time is idle time and rework, not
work* — is weaker than the process owner's actual answer, which was that the time goes to **all
three** of working, waiting and correcting; and that the administrative framing supplies a
structural argument needing no idle/busy split at all. That is a true observation but not a reason
to restage the argument: the assumption is corrected to match what was said (see below), and the
target stands on the same ground it always did.

**Narrowing the 25% target to department errors** is covered above: rejected as choosing the metric
for the result.

**Renaming the Approver role** is covered above: rejected on cost against precision the glossary
already delivers by other means.

## What it assumes

- That **permission to perform the work is genuinely granted outside this process**. The process
  owner said effort is approved or denied through other mechanisms entirely; the source brief says
  the form is what authorizes the work. §2 now follows the process owner. If the brief is right and
  the answer was loose, §2 is wrong and BDR-0005's whole framing is in question with it.
- That the five named controls are the **complete** set. They are everything the transcribed
  process and the decisions so far establish, but the brief has already been found incomplete once
  — the funding type was missing from its inputs list by the process owner's own acknowledgement,
  and the export classification field is still unaccounted for.
- That **"getting the departments right"** being the dominant error generalises beyond the
  product owner's impression. No error-rate data exists; §7's baselines are `TBD` throughout.

## Correction carried by this record

§10 assumption 1 asserted that *most* of today's elapsed time is idle time and rework. The process
owner's answer was *"all three"* — working, waiting **and** correcting — with 2+ weeks end to end
and data problems costing an approver time helping the submitter. The assumption is corrected to
say that, and it is no longer described as the single load-bearing claim under the cycle-time
target. It was already conceded in [BDR-0006](0006-what-the-product-records.md) that the product
cannot separate idle from busy, so the assumption was untestable as well as overstated.

This is a factual correction to a belief about the process, not a change to a decision. The target
it sat under is unchanged.

## What changes if this is overturned

If permission to do the work turns out to be granted **by this form** after all, §2 reverts, and
the damage runs much deeper than this record: [BDR-0005](0005-correction-in-place-and-revocation.md)
removed terminal refusal from the model on the strength of the same answer, so *rejected* would
have to come back as a state and revocation would stop being the only refusal.

If the control list is incomplete, §2 gains rows. Nothing else moves — the table is descriptive,
and no capability decision reads from it.

If "Approver" is later renamed, the cost is the rewrite this record declined to pay, and nothing
else: no decision anywhere depends on the role's name, only on what the role can do.
