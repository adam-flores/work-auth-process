# Business Case v2: Improving the Internal Work Authorization Process

**Status:** Draft — problem framed, solution direction set
**Last updated:** 2026-09-10
**Supersedes:** [BUSINESS_CASE.md](source/BUSINESS_CASE.md), which is kept unchanged as the original

> **Why there are two.** The original business case was written to be solution-agnostic, before
> any decision about what to build. This version keeps the problem framing intact and adds what
> has since been decided: the direction of the solution, the targets we hold ourselves to, and
> the shape of the ask. The original is preserved rather than edited so it stays visible what we
> believed before those decisions were made.
>
> Sections marked **[Derived]** were inferred rather than stated by the process owner and have
> not been validated. Decisions carried in here are recorded in full in [`docs/bdr/`](bdr/),
> and are `provisional` until the product owner confirms them.

---

## 1. Overview

| | |
|---|---|
| **Project title** | Improving the Internal Work Authorization Process |
| **Organization** | A large aerospace manufacturer (anonymized) |
| **Industry** | Aerospace and Defense |
| **Scope** | The internal work authorization form and the process surrounding it |

Employees frequently support work for departments other than their own. Each time they do, an
internal work authorization must be completed and approved before the work is properly
authorized and the hours can be booked.

---

## 2. Operational Context

Internal work authorizations serve three control functions:

- **Cost control between legal entities**, especially where those entities use different
  reporting systems.
- **Contract compliance**, particularly for foreign restricted government contracts, where costs
  must be tracked and allocated within US contract requirements.
- **Work authorization** itself — the form is what permits cross-departmental work to begin.

Because the form sits upstream of both cost allocation and the start of work, errors propagate
into two different kinds of harm: compliance and accounting exposure, and schedule delay.

---

## 3. Problem Statement

Employees and teams frequently struggle to complete the form accurately, because of limited
training, unclear guidance, and no accessible process support at the moment of entry. They rely
on a small number of knowledgeable individuals, producing a recurring cycle of repeated
questions, corrections, resubmissions, and one-on-one explanations.

**Root cause framing [Derived]:** the process knowledge required to complete the form correctly
exists, but it lives in people rather than in the form or in accessible guidance. Every
submission therefore risks becoming a support interaction.

### Where the time actually goes **[Derived]**

The process is a five-stage relay documented in
[`docs/process/work-authorization-flow.md`](process/work-authorization-flow.md): four
mandatory approvals, up to two conditional compliance gates, and a charge number minted at the
final step.

It would be easy to conclude that the delay is the *sequence* — six gates in a row, so remove
some. We believe that reading is wrong. The time is lost **inside** the steps rather than in the
count of them:

| Where time goes | Why |
|---|---|
| **Idle time** | A form sits because the approver does not know it is waiting on them |
| **Rework loops** | A form comes back because a field was wrong, and the relay restarts |
| **Context switching** | Approvers handle authorizations one at a time as they arrive |
| **Lookup effort** | Nine fields are read off a picture of an org chart and typed by hand |

None of these require changing a single sign-off to fix. This is the central claim of the
project, and the assumption most in need of validation — see §10.

---

## 4. Impact

**Operational inefficiency.** Time consumed answering repetitive questions, reviewing incorrect
forms, and managing corrections and resubmissions.

**Schedule delay.** Incomplete or inaccurate forms delay authorization, and can delay engineers
from beginning or continuing contract work.

**Reduced productivity of experts.** Knowledgeable employees repeatedly provide individual
support instead of doing their own jobs.

**Key-person dependency.** Process knowledge concentrated in a few people, creating
inconsistency and organizational risk.

---

## 5. Desired Outcome

Improve the **accuracy, consistency, and efficiency** of the internal work authorization process
so employees can complete forms successfully with minimal assistance — reducing errors and
rework, decreasing processing time, minimizing dependency on subject-matter experts, and letting
engineers proceed with contract work sooner.

---

## 6. Solution Direction

Recorded in full as [BDR-0001](bdr/0001-preserve-the-flow-rebuild-the-experience.md).

**The approval flow is preserved exactly as it stands.** Same steps, same order, same sign-offs.
We are not proposing changes to who approves what. In a business whose authorizations touch cost
allocation between legal entities and foreign restricted government contracts, leaving the
control structure untouched is a feature: nothing here requires re-approving the controls
themselves.

**Every improvement comes from the tooling around that flow** — a centralized product that keeps
good information together and makes the path through the process a manageable one.

| Capability | What it fixes |
|---|---|
| Digital form with field validation | Errors caught at entry rather than discovered downstream |
| Derived and pre-populated fields | The nine fields currently read off a picture of an org chart |
| Queue position visible to **all** parties | The originator can see where their form sits without asking |
| Per-role dashboards over a batch of work | Approvers work a queue in one sitting, not one interruption at a time |

In priority order, the claims are: **fewer mistakes**, then **less waiting**, then **less effort
per form**.

### What this deliberately does not do

Redesigning the workflow itself is **parked, not rejected**. The product owner may well want a
better sequence — approvals overlapped, conditional gates evaluated at origination, the charge
number issued earlier. Both things can be true, and the two are independent: improve the path
through the process now, redesign the process later. The prototype keeps the sequence
configurable rather than hard-coded so that decision stays cheap.

---

## 7. Success Measures

**The prototype does not demonstrate these.** Every participant in it is mocked, so elapsed time
in a demo measures how fast the operator clicks, and no honest baseline can come out of it.
Baselines are established by the pilot described in §8. The targets below are the bar we set
ourselves, stated up front so the pilot has something to test against — they are goals, not
findings.

### Headline targets

| | Target |
|---|---|
| End-to-end cycle time | **50% reduction** |
| Submission errors | **25% reduction** |

Both are percentages against baselines that are currently unknown. Establishing those baselines
is the first job of the pilot, not an input to it.

### Measures **[Derived]**

| # | Measure | Baseline | Target | Ties to |
|---|---|---|---|---|
| M1 | First-pass acceptance rate | TBD | +25% relative | Errors |
| M2 | Cycle time from form start to approved authorization | TBD | −50% | Cycle time |
| M3 | Resubmissions per authorization | TBD | −25% | Errors |
| M4 | SME support interactions per authorization | TBD | Decrease | Expert dependency |
| M5 | Share of forms completed without SME contact | TBD | Increase | Minimal assistance |
| M6 | Time-to-competence for a first-time submitter | TBD | Decrease | Training gap |

M1–M3 are computable from system data once the product exists. M4–M6 describe human behaviour
that a system cannot observe on its own and would need to be gathered alongside the pilot.

---

## 8. The Ask

Funding is requested in **two stages**, deliberately separated so that no money is committed to
a company-wide rollout before there is evidence it is warranted.

### Stage 1 — Prototype and pilot

Build the capability and run it with a real group of users on real authorizations. This stage
exists to **produce the data**: it establishes the baselines sitting at `TBD` throughout §7 and
measures what the capability actually moves.

Deliverable: a measured, defensible ROI — or the finding that the assumption in §3 was wrong,
which is worth knowing before the larger spend.

### Stage 2 — Operationalize company-wide

Funded on the strength of stage 1's results. Scope, cost, and timeline are **TBD** and should
stay that way until stage 1 reports.

This structure is the honest answer to "prove it works first." It cannot be proven without a
pilot, and a pilot is what stage 1 buys.

---

## 9. Stakeholders **[Derived]**

| Stakeholder | Interest in the process |
|---|---|
| Submitting employees / engineers | Complete the form correctly and start work without delay |
| Subject-matter experts | Stop absorbing repetitive one-on-one support requests |
| Approvers / department managers | Receive complete, accurate forms, and see everything waiting on them |
| Performing admin | Issue charge numbers against authorizations that are already correct |
| Finance / cost accounting | Correct cost allocation across legal entities and reporting systems |
| Contracts / compliance | Costs tracked within US contract requirements, controls unchanged |

---

## 10. Constraints and Assumptions **[Derived]**

**Constraints**

- Compliance obligations apply throughout; anything touching foreign restricted government
  contracts is subject to US contract requirements and likely export-control considerations.
- Legal entities may use **different reporting systems**, so no single common system of record
  can be assumed.
- This repository is a **class prototype**, not a deployed system.

**Assumptions**

1. **Most of today's elapsed time is idle time and rework, not work.** This is load-bearing. The
   entire cycle-time target rests on it, because the approval sequence is unchanged. If the six
   steps are genuinely busy end to end, the 50% target is unreachable.
2. The form is a legitimate and necessary control; the goal is to make it easier to complete
   correctly, not to eliminate it.
3. The information needed to complete the form correctly is knowable at the time of submission.
4. Improving guidance at the point of entry is a viable lever, because the failure mode is
   knowledge access rather than unwillingness.
5. Preserving the existing sign-off sequence is welcome rather than merely tolerated.

---

## 11. Out of Scope

- Changing the underlying cost-accounting or contract-compliance requirements
- Replacing the legal entities' existing reporting systems
- **Redesigning the approval sequence** — parked, not rejected; see §6
- Handling real company data, forms, contract identifiers, or personnel information

---

## 12. Open Questions

To be resolved with the process owner. The first three are the ones that would change the
direction in §6 if answered unexpectedly.

1. **When an authorization takes a long time, where does the time actually go** — approvers
   working through it, or the form sitting unnoticed and coming back for correction?
2. **Is preserving the existing sign-off sequence a requirement, a preference, or habit?**
3. **Would you rather have a tool that makes today's process work well, or a proposal for a
   different process?**
4. What is the current volume of authorizations per period, and the current error rate?
5. Which fields drive the majority of errors?
6. What is the cost of a single rework cycle, in SME time and in schedule delay?
7. Which requirements are compliance-mandated versus organizational convention?
8. What distinguishes a foreign restricted government contract submission from a standard one?

---

## Appendix

The original project overview, reproduced with the organization's name genericised, is
[Appendix A of the original business case](source/BUSINESS_CASE.md#appendix-a-original-project-overview).
It is not duplicated here so that the two copies cannot drift.
