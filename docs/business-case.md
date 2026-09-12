# Business Case v2: Improving the Internal Work Authorization Process

**Status:** Draft — problem framed, solution direction set
**Last updated:** 2026-09-12
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
internal work authorization must be completed and cleared through its sign-offs before the hours
can be booked against it. What that clearance controls — and, as §2 sets out, what it does not —
is the subject of this case.

---

## 2. Operational Context

Internal work authorizations serve two ends — **stopping what is not legally allowed to happen**,
and **keeping the financial ledger honest** by allocating work to the department that originated
it. Five named controls do that work.
[BDR-0009](bdr/0009-the-business-case-survives.md)

| Control | What it does | What it reads |
|---|---|---|
| **Permissibility rule** | Blocks a pairing of departments that may not work together, at entry rather than days later at a gate | The two departments on the authorization |
| **Contracts gate** | A conditional stage testing that the authorization is consistent with the funding contract's terms, under the **exception rules** the contract type triggers. It does not run at all for **company-funded** work, which has no customer contract to be consistent with — confirmed by the process owner | The **funding type** the requesting side supplies at intake — commercial contract, government commercial-item contract, government negotiated contract, or company funded |
| **Global Trade gate** | A conditional stage testing that the scope matches the declared export jurisdiction and classification | The **location type** entered on each side |
| **Classification** | Identifies the department each side belongs to, which is what the cost is allocated against | Three levels per side, from the department picker |
| **Four mandatory acknowledgements** | A program manager and a finance approver on each side, so nothing is assigned to an area without someone there knowing | Nothing conditional; they always run |

The first three are what stop what is not permitted — though two of them are conditional, and one
of those conditions has a confirmed negative case: **the Contracts gate does not run at all for
company-funded work.** One of the five controls therefore does not operate for a whole class of
work, which is worth stating plainly rather than leaving implied. Only the permissibility rule and
the four acknowledgements run on every authorization. Among the three contract types that do reach
the gate, each triggers a different combination of **exception rules**, so the funding type is
consequential inside the gate rather than a value the record merely carries. The fourth control is what keeps the ledger honest,
and is the one most exposed to human error — a misrouted authorization *"usually lands in the
wrong team's queue, and takes a few days to be routed where it should have gone."* The fifth is a
control over surprise, not over permission.

**What this process does not control is whether the work may happen.** That is approved or denied
through mechanisms outside it entirely. What it controls is whether the hours can be **booked**,
and against whom. This diverges from [the source brief](source/project-overview.md), which
describes the form as what permits cross-departmental work to begin; the process owner has since
described the process as administrative record-keeping, with no rejections, and **confirmed that
reading when asked directly**. The divergence is recorded here rather than smoothed over, because
the brief is not edited — but it is no longer an open risk. See §10, assumption 10.

Because the form sits upstream of both cost allocation and the point at which work can be booked,
errors propagate into two different kinds of harm: compliance and accounting exposure, and
schedule delay.

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
| **Rework loops** | A field is wrong, and the authorization stands still at the stage that found it while it is corrected |
| **Context switching** | Approvers handle authorizations one at a time as they arrive |
| **Lookup effort** | Nine fields are read off a picture of an org chart and typed by hand |

None of these require changing a single sign-off to fix. This is the central claim of the
project, and the assumption most in need of validation — see §10.

**The dominant error is named.** Asked which fields drive the majority of errors, the process
owner's answer was *"getting the departments right"* — which is the lookup effort above and the
misroute in §2, and is exactly where the solution concentrates. It is the argument the error
target rests on, not the target itself: the target in §7 stays broad, measured over every
correction request, because narrowing it to the one field we already expect to move would be
choosing the metric for the result.
[BDR-0009](bdr/0009-the-business-case-survives.md)

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
| Guided classification — filter on what you know, search what remains | The nine fields currently read off a picture of an org chart. **[Derived]** Settled as three levels per side — legal entity, division, department — in [BDR-0004](bdr/0004-the-classification-is-three-levels.md) |
| Criteria and guidance owned by the role that judges the field | Each approver's unwritten lens becomes explicit, so a form that satisfies one does not fail the next |
| A queue of what has arrived | Approvers work a batch in one sitting, not one interruption at a time |
| Notification the moment an authorization arrives | A form stops sitting because nobody knew it was waiting |
| An open master record of every authorization | Anyone can see where any authorization sits, without asking a person |
| A department queue anyone on the performing side can claim from | An authorization stops waiting on one named person being available |
| Reference data maintained inside the product, by an **Administrator** | A department missing from the org hierarchy is added where the work is, rather than leaving a submitter blocked with nowhere to turn. [BDR-0010](bdr/0010-an-administrator-maintains-the-hierarchy.md) |
| A **referral** — show an authorization to a colleague without handing it over | An approver who cannot answer something asks whoever can, and the asking is recorded rather than lost in a forwarded email. [BDR-0011](bdr/0011-a-referral-shows-it-without-moving-it.md) |
| Every stage timestamped three times over — arrived, notified, resolved | Where the time went becomes a fact the pilot can read off, not a claim. [BDR-0006](bdr/0006-what-the-product-records.md) |

In priority order, the claims are: **fewer mistakes**, then **less waiting**, then **less effort
per form**.

**Who does what is settled**, in
[BDR-0002](bdr/0002-the-cast-and-what-each-role-needs.md). The ten participants named in the
current process are three roles — a **Contributor** fills a section, an **Approver**
acknowledges at one stage or raises a **correction request** against it, and a **Charge Number
Admin** completes the authorization. What separates two approvers is not what they can do but
what they judge.

A **fourth role** sits outside the relay: an **Administrator** maintains what the process runs on
— the org hierarchy, the permissibility rules, the relay configuration, and the insights
dashboard — and touches no authorization directly. It is the only role whose actions are not
performed on an authorization, and naming it closes a gap three earlier decisions had already
opened by referring to an "administrator" that no record defined.
[BDR-0010](bdr/0010-an-administrator-maintains-the-hierarchy.md)

The vocabulary the rest of this project uses is in [`CONTEXT.md`](../CONTEXT.md).

**The relay acknowledges; it does not judge.** Whether work happens at all is approved or denied
through entirely different mechanisms. This process exists to stop what is not legally allowed to
happen and to keep the financial ledger honest by allocating work to the department that
originated it — and the sign-offs exist so nothing is assigned to an area without someone there
acknowledging it. No approver refuses on the merits. The five controls that do this work are named
in §2, and the tooling below leaves every one of them exactly where it is.
[BDR-0005](bdr/0005-correction-in-place-and-revocation.md) ·
[BDR-0009](bdr/0009-the-business-case-survives.md)

**The lifecycle is explicit, and the record is what happened rather than where it is.** Five
states are recorded — **Draft**, **On hold**, **Completed**, **Withdrawn**, **Revoked**. Where an
authorization sits in the relay is *derived* from the relay itself rather than stored, so there is
no status for anyone to maintain or forget. When a stage finds something wrong it raises a
**correction request** against the named fields: the authorization does not move, the stage becomes
*awaiting correction*, and the clock keeps running — so the days a defect costs stay attached to
the stage that found it rather than falling into a gap between stages. A correction that changes a
field an earlier stage depends on returns it there as a **re-review**. The **performing
department** is the exception: it is fixed once an authorization is initiated, because a different
department is a different request, so a wrong one is withdrawn and raised again rather than
re-routed. Time in each stage, decomposed into time the approver held
it and time it was out for correction, is what lets a pilot say *where* the elapsed time went and
how much of it was the data being wrong — though not, as §7 sets out, whether the rest of it was
idle or busy.
[BDR-0003](bdr/0003-the-authorization-lifecycle.md) ·
[BDR-0005](bdr/0005-correction-in-place-and-revocation.md) ·
[BDR-0006](bdr/0006-what-the-product-records.md) ·
[BDR-0012](bdr/0012-a-wrong-department-is-a-new-authorization.md)

**What is pushed is scoped; what is visible is not.** A person is notified about the authorizations
waiting on *their* action and nothing else, which is what keeps a queue a queue. What anyone can go
and look at is not scoped at all — every authorization is readable in full by anyone, which lets a
submitter chase their own work without asking around, and means no stage sees a narrower record
than another. This rests on the form carrying *average* labor rates rather than actual
compensation, so there is nothing on it to protect — see §10.
[BDR-0007](bdr/0007-one-project-many-resources.md)

**Asking a colleague is part of the process, and it is the only thing the product records and
never reports on.** A stage routes to a role at a department rather than to a named person, so any
holder of that role can act and no authorization waits on one individual being at their desk. Where
the answer lies outside that role entirely — the engineer who knows whether the scope is right — an
approver raises a **referral**: the colleague is notified and the asking is recorded, while the
authorization stays where it is and the sign-off still comes from the stage. Referrals are readable
in an authorization's history and excluded from every measure, counts included, because a metric
that counts how often someone asked for help is a metric against asking.
[BDR-0011](bdr/0011-a-referral-shows-it-without-moving-it.md)

**One authorization is one project.** It asks one department for work from another and may request
**one or more resources**, each with its own budget hours and rate. A second project, or work from
a second department, is a second authorization — which is what keeps the ledger allocation
attributable and the relay a single sequence. An impermissible pairing of departments is caught at
entry against a configurable list, rather than days later at a gate.
[BDR-0007](bdr/0007-one-project-many-resources.md)

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

**They will not be filled in before the pilot.** Asked for volumes, correction rates, and expert
time, the process owner said they are not needed and to invent history for the insights dashboard
instead. The dashboard's seeded data is fictional by design and always was — but the baselines
here are a different thing, and they stay `TBD` rather than borrowing a number from the demo. A
business-school deliverable with invented volumes is worse than one with blanks.

**Both stand unchanged under the administrative framing.** Neither target ever rested on the relay
rendering judgement — the cycle-time target rests on time being lost *inside* the steps rather than
in the count of them, which is unaffected by what the steps are for. If anything the framing makes
it easier to defend, since a stage that neither approves nor refuses has no deliberation to
protect, and days spent in one are days spent waiting. The target does not need the help and is not
restated to lean on it. [BDR-0009](bdr/0009-the-business-case-survives.md)

### Measures **[Derived]**

| # | Measure | Baseline | Target | Ties to | Source |
|---|---|---|---|---|---|
| M1 | Share of authorizations completed with zero correction requests | TBD | +25% relative | Errors | Product |
| M2 | Cycle time from initiation to completion | TBD | −50% | Cycle time | Product |
| M3 | Correction requests per authorization | TBD | −25% | Errors | Product |
| M4 | SME support interactions per authorization | TBD | Decrease | Expert dependency | Pilot survey |
| M5 | Share of forms completed without SME contact | TBD | Increase | Minimal assistance | Pilot survey |
| M6 | Time-to-competence for a first-time submitter | TBD | Decrease | Training gap | Pilot survey |

**M1–M3 come from the product.** What it records to make them computable is settled by
[BDR-0006](bdr/0006-what-the-product-records.md).

**M4–M6 come from a survey run during the pilot, not from the product.** All three ask whether
a submitter still has to go and find an expert, and a conversation between two colleagues is
invisible to software. The product makes no attempt to approximate them — counting when a
submitter opens a field's written guidance was considered as the one honest proxy available and
deliberately declined as more instrumentation than a prototype needs. They stay in this table
because they measure the thing §3 identifies as the actual failure mode; the *Source* column is
there so nobody later assumes the system will supply them.

#### What M2 measures, precisely

The clock starts when a submitter **initiates** — releases a draft into the relay — and stops
when the charge number completes the authorization. Time spent drafting is not measured, and an
abandoned draft leaves no trace. The product records nothing about the form-filling experience;
that is what the pilot survey is for.

Three refinements make the number defensible rather than merely large:

- **Time an authorization is held is excluded** and reported separately. Only the submitter can
  hold, and nobody is waiting while they do — charging that to an approver would be dishonest.
  Reporting it separately is the check that holds are not quietly absorbing delay.
- **Time *awaiting correction* is included**, and recorded as its own interval within the
  stage. A correction is the process failing while somebody waits, so the days it costs stay
  attached to the stage that found the defect rather than falling into a gap between stages
  ([BDR-0005](bdr/0005-correction-in-place-and-revocation.md)).
- **A stage re-entered as a re-review counts as a separate occurrence.** Its first pass is what
  is reported per stage; re-review time is a separate line. The rules or the data moved beneath
  that stage and nobody erred, so it is not charged as though someone had. The end-to-end total
  still includes every occurrence.

**What M2 can show:** which stage the elapsed time accumulated in, and how much of it was the
data being wrong rather than the approver being slow.

**What M2 cannot show:** whether the time an approver held an authorization was spent
considering it or spent with it sitting unopened. Separating those would mean recording when an
individual approver first opens an authorization, which was ruled out on two independent
grounds — that time in queue per stage is sufficient, and that opening an authorization does
not reliably indicate work has begun. The 50% target is unaffected; the ability to explain
*why* the number moved is narrower than originally claimed. This is stated rather than glossed
because an earlier draft of this section asserted the stronger version.

#### What counts as an error

Settled by [BDR-0005](bdr/0005-correction-in-place-and-revocation.md). Four things could be
counted and they are not the same:

| | Counted as an error? | |
|---|---|---|
| **Correction request** at a stage | **Yes** | a defect got past entry and cost days downstream |
| **Validation failure** at entry | Reported separately | the product did its job; nothing reached an approver |
| **Re-review** | No | the rules or the data moved beneath a stage; nobody erred |
| **Revocation** | No | the ask died; not a defect |

Entry catches are reported as a **prevention count**, never folded into the error rate —
otherwise the number would rise as the guidance improved, which is exactly when the product is
working. It is also the stronger argument: *n defects were caught at entry and m still got
through* beats reporting only the survivors.

#### Where the measures are seen

An **insights dashboard** presents them, restricted to administrators. Because the prototype is
pre-pilot and has no real history, it runs over a seeded set of authorizations with full
transition histories, so the screen shows what it would show in service rather than sitting
empty. Every figure is computed from the same records the live product writes — nothing on it
is hardcoded — which means the dashboard being right is itself evidence that the
instrumentation is right ([ADR-0006](adr/0006-insights-from-seeded-transition-history.md)).

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
| Administrators | Keep the org hierarchy and the permissibility rules correct, so nobody is blocked by reference data that is out of date |
| Finance / cost accounting | Correct cost allocation across legal entities and reporting systems |
| Contracts / compliance | Costs tracked within US contract requirements, controls unchanged |

---

## 10. Constraints and Assumptions **[Derived]**

**Constraints**

- Compliance obligations apply throughout; anything touching foreign restricted government
  contracts is subject to US contract requirements and likely export-control considerations.
- **Nothing integrates.** The organizational hierarchy lives outside this process and the
  Administrator maintains the product's own copy of it by hand
  ([BDR-0010](bdr/0010-an-administrator-maintains-the-hierarchy.md)); no finance, ERP, or
  reporting system is read from or written to, and no common system of record is assumed.
- This repository is a **class prototype**, not a deployed system.

**Assumptions**

1. **Enough of today's elapsed time is idle time and rework to make a 50% reduction reachable
   without touching the sequence.** Asked where the time goes, the process owner said **all
   three** — approvers working through it, the form sitting unnoticed, and correction — over a
   total of 2+ weeks end to end. So this is not the stronger claim an earlier draft made, that
   *most* of the time is idle; it is that the waiting and rework components are large enough to
   halve the total. It also stays an *assumption* and always will: the product deliberately does
   not record when an approver first opens an authorization, so a pilot can show which stage the
   time built up in and how much of it was rework, but not whether the remainder was idle
   ([BDR-0006](bdr/0006-what-the-product-records.md)). The target does not rest on this alone —
   see §7, where the administrative framing carries it independently.
   [BDR-0009](bdr/0009-the-business-case-survives.md)
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
8. **A stage's concern can be expressed as the set of fields it depends on.** It is what decides
   which sign-offs a correction invalidates. An approver whose judgement rests on something not on
   the form — requesting finance confirm funding held outside this process — declares no
   dependency and their sign-off survives every correction. That may be right, or it may mean
   their concern is under-modelled. Put to the process owner and **declined as
   over-complication**, so it stands as ours rather than confirmed.
   [BDR-0005](bdr/0005-correction-in-place-and-revocation.md)
9. ~~**No stage in the relay holds a genuine veto.**~~ **Confirmed, no longer an assumption.**
   Asked directly, the process owner answered that no stage holds a veto, Global Trade included.
   Terminal refusal stays out of the model, and the case we were least sure of is the one that was
   ruled out by name. [BDR-0005](bdr/0005-correction-in-place-and-revocation.md)
10. ~~**Permission to perform the work is granted outside this process.**~~ **Confirmed, no
    longer an assumption.** §2 follows the process owner, who describes the process as
    administrative record-keeping with no rejections, over
    [the source brief](source/project-overview.md), which describes the form as what permits
    cross-departmental work to begin. The two could not both be right, and the reading that was
    load-bearing for §2 and for the removal of terminal refusal is the one confirmed. The brief
    stays unedited and the divergence stays recorded in §2 as history.
    [BDR-0009](bdr/0009-the-business-case-survives.md)
11. **No stage's sign-off carries delegated authority tied to a named individual.** Load-bearing
    for the queue model in §6: a stage routes to a role at a department and any holder of that
    role may acknowledge, so nothing waits on one person. Aerospace finance sign-offs often do
    carry a threshold, a named signatory, or a delegation-of-authority list. If any stage here
    does, a stage has a fixed occupant, work has to be able to move *within* a stage, and the
    **referral** in §6 is the wrong model. **Narrowed, not resolved:** asked whether anyone ever
    signs in an approver's place, the process owner said *occasionally* — occasional rather than
    standing, which is what a role-shared queue already allows, and the delegated-authority half
    was not affirmed. What is left of the assumption is that the occasional signer **holds the
    stage's role**. [BDR-0011](bdr/0011-a-referral-shows-it-without-moving-it.md)
12. **The five controls in §2 are the complete set.** They are everything the transcribed process
    and the decisions so far establish — but the brief has already been found incomplete once, by
    the process owner's own acknowledgement, and the export classification field Global Trade
    validates against is still unaccounted for. Put to the process owner and **withdrawn** rather
    than answered: *five controls* is this document's framing, not theirs, and the question did not
    land. It stands as ours. [BDR-0009](bdr/0009-the-business-case-survives.md)
13. **The product's copy of the hierarchy is kept current by hand.** The hierarchy lives outside
    this process and the Administrator configures the product to match it, with nothing
    integrating the two. So the product cannot know that a department moved until somebody tells
    it, and a stale copy sends work to a department that no longer exists — the one failure mode
    the Administrator role cannot detect on its own.
    [BDR-0010](bdr/0010-an-administrator-maintains-the-hierarchy.md)

---

## 11. Out of Scope

- Changing the underlying cost-accounting or contract-compliance requirements
- Replacing the legal entities' existing reporting systems
- **Redesigning the approval sequence** — parked, not rejected; see §6
- **Escalating a stale authorization** — notifying someone when an authorization has sat too
  long needs an age threshold, and every baseline in §7 is `TBD`. Setting one now would mean
  inventing a number. Deferred until the pilot produces real timings, not rejected.
  [BDR-0002](bdr/0002-the-cast-and-what-each-role-needs.md)
- **Appeals of any kind.** Nothing in the relay refuses on the merits, so there is nothing to
  appeal against — confirmed: no stage holds a veto. A defect is corrected in place and the
  authorization continues forward; a **revocation**, which only the Administrator now causes, is
  terminal and is answered with a new authorization, not a reopening.
  [BDR-0005](bdr/0005-correction-in-place-and-revocation.md) ·
  [BDR-0012](bdr/0012-a-wrong-department-is-a-new-authorization.md)
- Handling real company data, forms, contract identifiers, or personnel information

---

## 12. Open Questions

To be resolved with the process owner. Every question a provisional decision depends on
collects here, grouped by what it would change.

### Would change the solution direction in §6

From [BDR-0001](bdr/0001-preserve-the-flow-rebuild-the-experience.md).

1. ~~**When an authorization takes a long time, where does the time actually go?**~~
   **Answered:** all three — approvers working through it, the form sitting unnoticed, and
   correction — over 2+ weeks end to end. Carried into §10, assumption 1.
2. **Is preserving the existing sign-off sequence a requirement, a preference, or habit?**
3. **Would you rather have a tool that makes today's process work well, or a proposal for a
   different process?**
4. ~~**Does an approver ever get someone else to sign in their place?**~~ **Answered:**
   occasionally, but occasionally rather than by standing arrangement, and no delegated authority
   tied to a named individual was affirmed. A stage routing to a role already covers it, so the
   referral and the shared queue both hold. Carried into §10, assumption 11, narrowed.
   [BDR-0011](bdr/0011-a-referral-shows-it-without-moving-it.md)

### Would change who sees what, and how consistency is achieved

From [BDR-0002](bdr/0002-the-cast-and-what-each-role-needs.md).

4. **Are the labor figures on the form average rates or actual compensation? And is there
   anything on an authorization one legal entity would not want another to read?** The open
   master record in §6 depends on both answers.
5. **What does the requesting finance approver actually approve?** The budget hours and labor
   rate arrive later, from the performing side, so at their step there is no budget on the form
   yet.
6. ~~**When an approver denies an authorization today, do they give a written reason, and does it
   reliably reach the person who submitted it?**~~ **Answered, by dissolution:** nothing is
   denied. The process is administrative record-keeping and there are no rejections; a defect is
   corrected in place and continues forward.
   [BDR-0005](bdr/0005-correction-in-place-and-revocation.md)
7. **Would your approvers write down what they check for, and keep it up to date?** If not, the
   consistency capability in §6 has no mechanism behind it.
8. **Is the employee assigned to the work ever involved before the charge number exists?**

### Would change what the product records, and what it can later measure

From [BDR-0003](bdr/0003-the-authorization-lifecycle.md).

9. ~~**Does any stage hold a genuine veto?**~~ **Answered: no**, Global Trade included. Terminal
   refusal stays out of the model and BDR-0005 reaches `final` on its foundation. Carried into
   §10, assumption 9. [BDR-0005](bdr/0005-correction-in-place-and-revocation.md)
10. ~~**Who, specifically, can revoke an authorization — and when?**~~ **Answered: N/A** — an
    approver revoking is not something the process does. Our widening to *any approver at or
    before the current stage* is withdrawn, and **Revoked** keeps one cause: the Administrator
    moving or deactivating a department, which revokes the in-flight work naming it. Every other
    ending is the submitter's.
    [BDR-0012](bdr/0012-a-wrong-department-is-a-new-authorization.md)
11. **Can anyone other than the submitter pause an authorization** — an approver, a program
    manager, a finance lead? We have assumed not.
12. **When work reaches a performing department, is there a queue anyone there can pick from,
    or is it handed to a named person by prior arrangement?**
13. ~~**Is two weeks the right life for an untouched draft?**~~ **Answered: make it a month.**
    Applied everywhere the value appears. It still deletes the draft rather than archiving it,
    which nobody has objected to.
    [BDR-0003](bdr/0003-the-authorization-lifecycle.md)

### Would change who maintains the reference data

From [BDR-0010](bdr/0010-an-administrator-maintains-the-hierarchy.md).

16. ~~**Where does the org hierarchy actually live today, and who maintains it?**~~ **Answered:**
    it lives outside this process, and the Administrator configures the product's own copy to
    match it. So the product is not the system of record, nothing integrates, and the real
    question becomes how the copy stays current — now §10, assumption 13, and the one failure mode
    the Administrator cannot detect unaided.
    [BDR-0010](bdr/0010-an-administrator-maintains-the-hierarchy.md)

### Needed to size and target the work

14. ~~What is the current volume of authorizations per period, and the current error rate?~~
    **Closed, not answered.** Asked twice; the process owner does not have these and says they
    are not needed. The §7 baselines stay `TBD` until the pilot produces them.
15. ~~Which fields drive the majority of errors?~~ **Answered:** getting the departments right.
    Carried into §3; it sharpens the error argument without narrowing the §7 target.
    [BDR-0009](bdr/0009-the-business-case-survives.md)
16. ~~What is the cost of a single rework cycle, in SME time and in schedule delay?~~
    **Answered:** hours to days per issue. Expert time per week remains unquantified and is
    closed with item 14.
17. ~~Which requirements are compliance-mandated versus organizational convention?~~
    **Withdrawn.** Asked twice, including a narrower re-ask about which fields could be removed
    or deferred without breaking an externally imposed rule, and it did not land either time. It
    has no consumer: [BDR-0001](bdr/0001-preserve-the-flow-rebuild-the-experience.md) preserves
    the form as it stands, so this project proposes removing no field.
18. What distinguishes a foreign restricted government contract submission from a standard one?

---

## Appendix

The original project overview, reproduced with the organization's name genericised, is
[`docs/source/project-overview.md`](source/project-overview.md).
It is not duplicated here so that the two copies cannot drift.
