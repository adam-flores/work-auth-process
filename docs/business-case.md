# Business Case v2: Improving the Internal Work Authorization Process

**Status:** Draft — problem framed, solution direction set
**Last updated:** 2026-09-11
**Supersedes:** the first-draft business case, retired once this version carried everything it held

> **This is the business case.** An earlier draft was written to be solution-agnostic, before any
> decision about what to build. This version keeps its problem framing intact and adds what has
> since been decided: the direction of the solution, the targets we hold ourselves to, and the
> shape of the ask. The draft was retired once it held nothing this one does not. What was
> believed before those decisions were made is recorded where it belongs — in [`docs/bdr/`](bdr/),
> against each decision.
>
> The primary source both versions were written from is
> [`docs/source/project-overview.md`](source/project-overview.md).
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

Recorded in full as [BDR-0001](bdr/0001-preserve-the-flow-rebuild-the-experience.md),
[BDR-0002](bdr/0002-the-cast-and-what-each-role-needs.md), and
[BDR-0003](bdr/0003-the-authorization-lifecycle.md).

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
| Criteria and guidance owned by the role that judges the field | Each approver's unwritten lens becomes explicit, so a form that satisfies one does not fail the next |
| A queue of what has arrived | Approvers work a batch in one sitting, not one interruption at a time |
| Notification the moment an authorization arrives | A form stops sitting because nobody knew it was waiting |
| An open master record of every authorization | Anyone can see where any authorization sits, without asking a person |
| A department queue anyone on the performing side can claim from | An authorization stops waiting on one named person being available |
| Every stage timestamped four times over | Where the time went becomes a fact the pilot can read off, not a claim |

In priority order, the claims are: **fewer mistakes**, then **less waiting**, then **less effort
per form**.

**Who does what is settled**, in
[BDR-0002](bdr/0002-the-cast-and-what-each-role-needs.md). The ten participants named in the
current process are three roles — a **Contributor** fills a section, an **Approver** accepts
or denies at one stage, and a **Charge Number Admin** completes the authorization. What
separates two approvers is not what they can do but what they judge. The vocabulary the rest
of this project uses is in [`CONTEXT.md`](../CONTEXT.md).

**The lifecycle is explicit, and the record is what happened rather than where it is.** Five
states are recorded — **Draft**, **On hold**, **Completed**, **Withdrawn**, **Rejected**. Where
an authorization sits in the relay is *derived* from the relay itself rather than stored, so
there is no status for anyone to maintain or forget. A **denial** is an approver returning
something *fixable*, and correcting and resubmitting is the appeal; a **rejection** is a refusal
on the merits of the ask and is terminal. Every stage records when the authorization arrived,
when the approver was notified, when they first opened it, and when they acted — which is what
turns "most of the elapsed time is idle time" from this document's central assumption (§10) into
something a pilot can measure. [BDR-0003](bdr/0003-the-authorization-lifecycle.md)

**Visibility is asymmetric by design.** What reaches a person is scoped — an approver's queue
shows the step in front of them, not the whole record. What a person can go and look up is not
scoped at all: every authorization is readable by anyone, which is what lets a submitter chase
their own work without asking around. This rests on the form carrying *average* labor rates
rather than actual compensation, so there is nothing on it to protect — see §10.

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

M1–M3 are computable from system data once the product exists — specifically from the four
timestamps every stage records ([BDR-0003](bdr/0003-the-authorization-lifecycle.md)), which is
what makes M2 separable into time an authorization sat unopened and time it spent under
consideration. M4–M6 describe human behaviour that a system cannot observe on its own and would
need to be gathered alongside the pilot. Exactly what each measure counts is still open.

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
| Submitters | Complete the authorization correctly and start work without delay |
| Subject-matter experts | Stop absorbing repetitive one-on-one support requests |
| Approvers | Receive complete, accurate authorizations, and see everything waiting on them at once |
| Charge Number Admin | Mint charge numbers against authorizations that are already correct |
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
6. **The labor figures on the authorization are average rates, not actual compensation, and
   nothing else on it is sensitive between legal entities.** Load-bearing for the open master
   record in §6: if actual pay appears on an authorization, or one entity would object to
   another reading its cost estimate, then open access is wrong and visibility has to be scoped
   instead. [BDR-0002](bdr/0002-the-cast-and-what-each-role-needs.md)
7. **Approvers will write down what they check for, and keep it current.** The criteria-and-
   guidance capability in §6 assumes the expertise this project is trying to spread is willing
   to be written down. That is a behavioural bet, not a technical one, and it is the weakest
   joint in the consistency argument.
8. **Recording when an individual approver first opens an authorization is acceptable.**
   Separating time an authorization sat unopened from time it spent under consideration is what
   lets assumption 1 be tested rather than asserted — and it makes approvers individually
   visible on responsiveness. That is an organizational question, not a technical one. If the
   answer is no, the measure collapses to a single arrival-to-action interval and the
   cycle-time argument keeps its target but loses its diagnosis.
   [BDR-0003](bdr/0003-the-authorization-lifecycle.md)
9. **Approvers sometimes refuse an authorization outright, rather than only returning it for
   correction.** The distinction between a denial and a rejection in §6 assumes both acts exist
   in practice. If every refusal is really a correction request, one state has no cause.
   [BDR-0003](bdr/0003-the-authorization-lifecycle.md)

---

## 11. Out of Scope

- Changing the underlying cost-accounting or contract-compliance requirements
- Replacing the legal entities' existing reporting systems
- **Redesigning the approval sequence** — parked, not rejected; see §6
- **Escalating a stale authorization** — notifying someone when an authorization has sat too
  long needs an age threshold, and every baseline in §7 is `TBD`. Setting one now would mean
  inventing a number. Deferred until the pilot produces real timings, not rejected.
  [BDR-0002](bdr/0002-the-cast-and-what-each-role-needs.md)
- **Appealing a rejection.** A denial is already the route back for anything fixable; an appeal
  against a refusal on the merits would need an adjudicator the process has no role for, and a
  way out of a terminal state. A rejection made in error is answered with a new authorization.
  [BDR-0003](bdr/0003-the-authorization-lifecycle.md)
- Handling real company data, forms, contract identifiers, or personnel information

---

## 12. Open Questions

To be resolved with the process owner. Every question a provisional decision depends on
collects here, grouped by what it would change.

### Would change the solution direction in §6

From [BDR-0001](bdr/0001-preserve-the-flow-rebuild-the-experience.md).

1. **When an authorization takes a long time, where does the time actually go** — approvers
   working through it, or the form sitting unnoticed and coming back for correction?
2. **Is preserving the existing sign-off sequence a requirement, a preference, or habit?**
3. **Would you rather have a tool that makes today's process work well, or a proposal for a
   different process?**

### Would change who sees what, and how consistency is achieved

From [BDR-0002](bdr/0002-the-cast-and-what-each-role-needs.md).

4. **Are the labor figures on the form average rates or actual compensation? And is there
   anything on an authorization one legal entity would not want another to read?** The open
   master record in §6 depends on both answers.
5. **What does the requesting finance approver actually approve?** The budget hours and labor
   rate arrive later, from the performing side, so at their step there is no budget on the form
   yet.
6. **When an approver denies an authorization today, do they give a written reason, and does it
   reliably reach the person who submitted it?**
7. **Would your approvers write down what they check for, and keep it up to date?** If not, the
   consistency capability in §6 has no mechanism behind it.
8. **Is the employee assigned to the work ever involved before the charge number exists?**

### Would change what the product records, and what it can later measure

From [BDR-0003](bdr/0003-the-authorization-lifecycle.md).

9. **What actually separates a denial from a rejection in your process?** We have modelled a
   denial as concerning something fixable and a rejection as concerning the merits of the ask.
   Do approvers ever refuse outright — and if so, what makes them do one rather than the other?
10. **Is it acceptable to record when an individual approver first opens an authorization?**
    It is what separates idle time from review time, and it makes approvers individually
    visible on responsiveness.
11. **Can anyone other than the submitter pause an authorization** — an approver, a program
    manager, a finance lead? We have assumed not.
12. **When work reaches a performing department, is there a queue anyone there can pick from,
    or is it handed to a named person by prior arrangement?**
13. **Is two weeks the right life for an untouched draft?** Chosen as a policy value with no
    evidence behind it, and it deletes the draft rather than archiving it.

### Needed to size and target the work

14. What is the current volume of authorizations per period, and the current error rate?
15. Which fields drive the majority of errors?
16. What is the cost of a single rework cycle, in SME time and in schedule delay?
17. Which requirements are compliance-mandated versus organizational convention?
18. What distinguishes a foreign restricted government contract submission from a standard one?

---

## Appendix

The original project overview, reproduced with the organization's name genericised, is
[`docs/source/project-overview.md`](source/project-overview.md).
It is not duplicated here so that the two copies cannot drift.
