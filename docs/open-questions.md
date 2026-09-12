# Open questions

Every question this project needs answered, in one place.

**Purpose:** Every decision made on this project so far has been made on our own judgement,
without confirmation from anyone who actually runs the process or owns the system. Those
decisions are recorded as `provisional` and each one states the question it depends on. This
document collects all of them, plus the questions the source material left open, so they can be
answered in one pass instead of accumulating unasked.

**From:** Adam Flores &nbsp;·&nbsp; **To:** the process owner and product owner &nbsp;·&nbsp;
**How your answers will be used:** to confirm or overturn the provisional decisions in
`docs/bdr/`, fill the `TBD` baselines in the business case, and correct the transcribed process
document.

**Two roles, one person.** The _process owner_ is accountable for achieving the objectives the
process serves and is the source of truth for how it works today. The _product owner_ is
accountable for the design of the system that facilitates it. On this project both are played by
the same person, so this document carries the complete set for both — every question either role
needs to answer, with nothing held back for a separate conversation.

A few questions are marked **[product owner]** where they ask for a direction rather than a fact.
That is a note about what kind of answer is wanted, not an instruction to skip anything: answer
straight through.

---

## Context

This is an MBA course project proposing an improved internal work authorization process — the
form completed when an employee's department supports work for another department. The work so
far has produced a business case, a transcription of the current process flow, and a set of
recorded design decisions. It is a class prototype: it will never be operationalized, and every
participant in it is mocked.

The reason for this document is that roughly two dozen questions have built up, of which **two
are currently blocking work**, several would change the direction of the solution if answered
differently, and the rest are assumptions we are building on that would be cheaper to correct
now than later.

---

## How to answer

**Effort:** about 45 minutes written, or a one-hour conversation. Section 1 alone is 10 minutes
and is the one that matters most — if you only answer one section, answer that one. **Section 7
is the shortest and the second most important**: it is the three decisions we have already built
on, and it takes about five minutes to agree or push back.

**Answer everything you can.** This is the whole backlog, not a first instalment, and there is no
second document holding the questions this one left out.

**Partial answers are useful.** So is "I don't know" and so is "nobody knows, it's folklore."
A recorded reason a question cannot be answered is a real result; a skipped question is not.
Please flag anything you're unsure of rather than leaving it blank.

**A note on confidentiality.** The project repository is public. Answers are paraphrased into it,
never pasted. Please **do not include** real entity names, cost center or CAS codes, contract
numbers, program names, employee names, or actual cost figures. Where a question asks for a
number, an order of magnitude or a range is entirely sufficient — "tens per month," "most of
them," "a few days." Where you need to name something to make the answer clear, describe it
generically.

**How your answers are recorded.** The blockquoted answers below are **our summary of what you
told us, in our words — not a transcript**. We capture what an answer establishes and drop the
phrasing, so nothing you write here is quoted back at you. Answer roughly and in shorthand; that
is what this document is for. If a summary has lost or twisted your meaning, say so and we will
fix it — that is the only thing worth checking them for.

---

## 1. The classification lookup

Nine of the form's fields are marked as coming from the company chart and needing to be
"manually analyzed and entered by the user." We have treated this as the single biggest source
of manual effort and error in the process, and it is where the proposed solution concentrates.
Designing a replacement has stalled on the first question below.

### When someone fills in the CAS block, what are they actually looking for?

_Why this matters: this is one of the two blocking questions. We assumed the employee finds
their own department on the chart. But the chart's boxes are supply units, service centers and
legal entities — one box holds three services, another holds two cities, another is a foreign
legal entity. None of those is a department, and no department name appears on the chart
anywhere. So we don't know what the task actually is._

> The task is to identify the department the work is being requested **from**. Departments sit under divisions, and divisions under legal entities. A single request can ask for several resources from the same department.

### Does a given department always map to the same chart unit, or can it vary?

_Why this matters: it decides whether this is solvable at all by automation. If the mapping is
fixed, we build the lookup table once and nobody ever opens the chart again. If it depends on
the work, the funding, or the site, then it is a judgement and the product has to help someone
reason rather than help them search._

> Legal entities, divisions and departments are relatively static, but restructures and acquisitions do change them — so an admin function is needed to manage them.

### If the mapping is fixed — does that table exist anywhere today?

> Build it ourselves, for this project's purposes.

### The form asks for four lookup levels (group, CAS group, CAS segment, CAS SBU, legal entity). The chart supplies three (chart, segment, unit). Which form field does each chart level answer?

_Why this matters: we have four labels and three things to put in them, and we cannot tell
whether "unit" answers the SBU field, the legal-entity field, or both at once._

> Use **legal entity, division and department**. CAS terminology is meaningful inside the company and carries no meaning outside it.

### Is "group selection" — asked on the requesting side only — the same thing as "CAS group," or a different field entirely?

> Different fields, and the two sides may never match — that should be a validation rule. The requesting side identifies its own department *and* the department it is asking. On the prototype: blend variants **A and C** — filter on attributes you are certain of, then search what remains.

### How does someone currently know which of the three charts to open?

_Why this matters: the three charts share no layout and no code scheme, and nothing on the form
says which one applies. We can't tell whether this is genuinely ambiguous or whether everyone
just knows._

> It varies. People generally know their own department's name, but similar names mean they still have to be careful to pick the US entity rather than a foreign one, so filters help even there. For other departments, they filter by attributes.

### When someone gets this wrong today, what goes wrong downstream, and who catches it?

> It usually lands in the wrong team's queue, and takes a few days to be routed where it should have gone.

---

## 2. Where the time actually goes

The business case targets a 50% reduction in cycle time while deliberately leaving the approval
sequence unchanged. That only works if most of today's elapsed time is waiting and rework rather
than work. This is the most load-bearing assumption in the project.

### When an authorization takes a long time, where does the time go — approvers working through it, or the form sitting somewhere waiting to be noticed, or coming back for correction?

_Why this matters: if the six approval steps are genuinely busy end to end, the cycle-time target
is unreachable and our central decision was wrong. We would rather find that out now._

> All three. End to end it generally takes more than two weeks. Data problems cost an approver time and effort helping the submitter get what they need and reach the right person.

### Is preserving the existing sign-off sequence a requirement, a preference, or simply how it has always been? **[product owner]**

> Maintain the current sequence.

### Would you rather have a tool that makes today's process work well, or a proposal for a different process? **[product owner]**

_Why this matters: we assumed the first and parked the second. Both are legitimate projects, but
they are different projects._

> Focus on streamlining the experience of the existing process.

### Roughly how long does an authorization take end to end today — and how long does it take when it goes badly?

> Answered above.

---

## 3. What people can see, and what happens on a denial

We have proposed that every authorization is readable by anyone with access, and that approvers
see only what they need to act. Both rest on assumptions about sensitivity.

### Are the labor figures on the form average rates, or actual compensation?

_Why this matters: we have assumed averages. If actual pay appears on an authorization, then
making every record openly readable is wrong and visibility has to be restricted instead._

> Averages.

### Is there anything else on an authorization that one legal entity would not want another to read?

_Why this matters: cost allocation between entities is exactly the kind of thing business units
can be guarded about. We have assumed nothing here is sensitive, which may be naive._

> No.

### When an approver denies an authorization today, do they give a written reason — and does it reliably reach the person who submitted it?

_Why this matters: we have assumed a written comment is mandatory and always reaches the
submitter. If it doesn't today, that gap may be a large part of the rework problem._

> The process is **administrative record-keeping rather than approval**. There are no rejections — effort is approved or denied through other mechanisms entirely. Its purpose is to make sure financials are routed to the right place, and the sign-offs exist so nothing is auto-assigned to an area without someone there acknowledging it.

### When something is denied, does it go back to the start, or resume where it stopped?

> It is fixed, and continues forward.

### Can a later approver reject something an earlier approver already passed?

> Not applicable.

### What does the requesting finance approver actually approve?

_Why this matters: the flow has them approving a budget at stage 1, but the budget hours and
labor rate are entered by the performing side at stage 2 — so at their step, there is no budget
on the form yet. We have assumed they are confirming funds against something held outside this
process._

> That funding exists for the requested work and ties back to the original project. The assumption is correct.

### Is the employee assigned to the work ever involved before the charge number exists?

> No — it is forward-looking, not back-dated.

### Do approvers ever refuse an authorization outright, rather than returning it for correction?

_Why this matters: we have split the two. A **denial** concerns something fixable — you correct
it and resubmit, and that is the only appeal there is. A **rejection** concerns the merits of
the ask and ends the authorization for good. If in practice everything is a correction request
and a dead authorization is simply one nobody resubmits, then one of those two states has no
cause and we should drop it. If both do happen, what makes an approver do one rather than the
other?_

> Not really.

### Would it be acceptable to record when an individual approver first opens an authorization?

_Why this matters: this is the one question here that is about your organization rather than
your process. Our whole cycle-time case rests on most of the elapsed time being idle rather than
busy — and the only way to show that rather than assert it is to record when an authorization
arrived, when the approver was notified, when they first opened it, and when they acted. That
also makes individual approvers visible on how quickly they respond. If that would make this
harder to sell internally, say so: we lose the ability to tell waiting from working, but the
target itself survives._

> Time in queue at each stage is sufficient. A historical log of who an authorization passed between *within* a stage would be useful, but should not be reported on.

### When an approver opens an authorization, does that reliably mean they have started work on it?

_Why this matters: we record the moment an approver first opens an authorization, and use it to
separate time it sat unnoticed from time it spent under consideration — which is where the whole
cycle-time diagnosis lives. That only holds if opening approximates starting. If your approvers
open everything each morning and act later, the signal is noise and we should stop collecting
it. This is separate from whether recording it is acceptable, which is asked above._

> No. Approvers are generally requesting a resource they need, and the wider initiative is already underway.

### Can anyone other than the submitter pause an authorization?

_Why this matters: we have proposed that a submitter can put an authorization on hold — it
leaves everyone's queue, and resumes at the stage it left. We have assumed nobody else can do
that. If an approver, a program manager, or a finance lead can legitimately suspend work, we
have the wrong model._

> Not needed. They might revoke it, but nothing beyond that.

### How does the receiving department know the ask is for them?

_Why this matters: this is now blocking work. Nothing in the source material says how an
authorization reaches the performing side. The form's inputs list carries no field naming the
performing department, and the process flow shows the handover only as an arrow between stages 1
and 2. So we think intake happens out-of-band today — the submitter already knows who they are
asking and tells them, and the form documents the ask rather than delivering it. If that is
right, the system has to introduce something the paper process never had, and we cannot design
the performing side until we know what. Please describe what actually happens between "I need
another department to do this" and that department knowing about it._

> The submitter messages them directly. They generally already know the person who represents the department they want work from.

### When work reaches a performing department, is there a queue anyone there can pick from, or is it handed to a named person by prior arrangement?

_Why this matters: at the moment the authorization is handed over, no performing-side person is
named on it — every performing name is a field that side fills in afterwards. We have proposed a
shared department queue that anyone there can claim from. If instead it goes to a specific person
by standing arrangement, the handover works differently._

> It goes to a representative of the department — usually one, sometimes a few. The submitter should be able to name a specific representative, or leave it in a general department queue.

### Is two weeks the right life for an untouched draft?

_Why this matters: we have proposed that a half-filled draft nobody has touched for two weeks is
deleted. That number is ours, with nothing behind it, and it deletes rather than archives._

> Make it a month.

---

## 4. Discrepancies in the source document

These were found while transcribing the process flow by hand and recorded as-found rather than
corrected, so the transcription stays faithful. Each is probably a small error in the source —
but we would rather confirm than assume. Quick yes/no answers are fine.

### The performing entity's legal-entity field is labelled "Requesting Legal Entity" — the same string as the requesting block. Copy-paste error, or does the performing side genuinely record the requesting entity there?

> The question was not clear as asked.

### The stage numbering runs 1, 2, 3, 4, 4, 5. Are Global Trade and Performing Admin one stage or two?

> Two stages, as indicated.

### Global Trade validates an export classification "selected by the originator," but no such field appears in the form's inputs. Where does that selection actually happen?

> The determination is made from a combination of existing fields — give them all the attributes.

### The Contracts gate names three funding types — Commercial, FAR 12, FAR 15 — but no routing difference between them. Do all three follow the same review path?

> Deferred — the product owner will come back to this.

**Partly answered since, and re-asked narrower below.** The funding field as it appears at order
entry has **four** values, not three: the fourth is work the company funds itself. That supplies
the negative case the gate's condition always implied, so the routing difference is company-funded
versus contract-funded.

### Is the Contracts gate skipped entirely when work is company funded?

_Why this matters: we have taken it as skipped, because the gate's condition is "is the request
funded by a customer contract?" and company-funded work is not one. If that is right, one of the
five controls the process operates does not run at all for a whole class of work — which is worth
stating plainly in the business case rather than leaving implied. If Contracts reviews
company-funded work too, then the condition is not really about a customer contract and we have
the gate's trigger wrong._

### Once the gate is reached, do the three contract types differ from one another?

_Why this matters: this is what is left of the original question. It may well be that all three
follow an identical path, in which case the distinction only matters to whoever reads the record
later and the product just stores it. We are building on that assumption._

---

## 5. Sizing the problem

These fill the baselines currently sitting at `TBD` in the business case. Orders of magnitude are
fine; we are not going to publish precise figures.

### Roughly how many authorizations are raised per month?

> TBD

### Roughly what share of them come back for correction at least once?

> TBD

### Which fields drive the majority of errors?

_Why this matters: we have assumed it's the nine lookup fields. If it's actually the budget
figures or the approver names, the solution is aimed at the wrong target._

> Getting the departments right.

### What does a single rework cycle cost, in expert time and in schedule delay?

> Hours to days per issue.

### How much of an expert's week goes to answering questions about this form?

> TBD.

### Which requirements on the form are compliance-mandated, and which are organizational convention?

_Why this matters: it tells us what genuinely cannot be changed versus what merely has not been._

> All fields are required.

### What distinguishes a foreign restricted government contract submission from a standard one, from the submitter's point of view?

> It depends on the government contract the work is associated with, which can carry restrictions on how and where the work is performed.

---

## 6. Assumptions we are building on

Not questions so much as statements to agree or disagree with. A one-word reaction to each is
enough; we only need to know which ones you'd push back on.

### The form is a legitimate and necessary control. The goal is to make it easier to complete correctly, not to eliminate it.

> Correct.

### Everything needed to complete the form correctly is knowable at the time of submission.

> Correct.

### The transcribed process flow is accurate.

_Why this matters: `docs/process/work-authorization-flow.md` was transcribed by hand from your
reference document, and every decision since has been measured against it. Section 4 asks about
the four discrepancies we already know about — this asks the blanket question. If a stage is
missing, out of order, or does more than we recorded, we would rather find out now._

> Correct.

### A prototype with entirely mocked participants cannot demonstrate that the process improved.

_Why this matters: this is why we are not building an "as-is" version to contrast against, and
why the ask is a funded pilot rather than a claimed result. Elapsed time in a demo measures how
fast the operator clicks. If you expected the prototype itself to prove the improvement, we have
built the wrong thing and should know before it is finished._

> Correct.

### The failure mode is knowledge access, not unwillingness — so better guidance at the point of entry is a viable lever.

> Correct.

### Your approvers would write down what they check for, and keep it current.

_Why this matters: we have proposed that each approver owns the written criteria for the fields
they judge. That is a behavioural bet, not a technical one, and it is the weakest joint in our
consistency argument. If they wouldn't, the expertise problem moves rather than dissolves._

> Correct.

### The employee assigned to the work is a name on a form, not a participant — they take no action in the process.

> Correct.

### Legal entities use different reporting systems, so no single common system of record can be assumed.

>

---

## 7. Decisions we have already made

Three decisions are recorded in `docs/bdr/` and the repository has been built on all of them.
Every one is marked **provisional**, which in this project means _decided on our own judgement
and not yet confirmed by anyone who runs the process or owns the system_. Section 6 asks about
the beliefs underneath them; this section puts the decisions themselves up for confirmation.

**Agree, disagree, or "not my call" is enough.** Where you disagree, the useful sentence is
which part. Each one says what it would cost to reverse, so you can weigh it — none of them is
expensive to change today, and all three get dearer the longer they stand.

### BDR-0001 — Preserve the flow, rebuild the experience

We model today's approval sequence **exactly as it stands**: same steps, same order, same
sign-offs. Every improvement comes from the tooling built around it. We are not building a
digitized copy of today's experience to contrast against a redesigned one, and the prototype is
not offered as evidence the approach works — its job is to make the capability concrete enough
to justify a funded pilot.

_Reversing it:_ if it turns out approvers are genuinely busy rather than the form sitting
unnoticed, the cycle-time target goes and the claim narrows to accuracy alone. If the flow
itself must change, the sequence is deliberately swappable, so it should cost a configuration
change and a redraw — not a rebuild.
[BDR-0001](bdr/0001-preserve-the-flow-rebuild-the-experience.md)

> Nothing stands out

### BDR-0002 — Three roles, and open visibility

The ten participants in the flow document collapse to **three roles** — Contributor, Approver,
Charge Number Admin — separated by what they can do rather than what they are accountable for.
Every authorization is **readable by anyone** with access, while a queue shows an approver only
what they need to act. And the role that judges a field **owns that field's written criteria**,
rather than the criteria being authored by whoever builds the form.

_Reversing it:_ if the labor figures are actuals or anything else is entity-sensitive, open
visibility is wrong and reverts to need-to-know — moderate, and the roles survive. If criteria
ownership is rejected, guidance has to be authored centrally and the key-person dependency the
business case names moves rather than dissolves.
[BDR-0002](bdr/0002-the-cast-and-what-each-role-needs.md)

> Nothing stands out

### BDR-0003 — The authorization lifecycle

Five recorded states — Draft, On hold, Completed, Withdrawn, Rejected — with position in the
relay **derived** rather than stored, so nobody maintains a status by hand. A **denial** returns
something fixable; a **rejection** refuses on the merits and is terminal. The performing entity
is a **department with a claimable queue**, not a named person. Every stage records four
timestamps — arrived, notified, acknowledged, resolved.

_Reversing it:_ if rejection on the merits does not exist, one state disappears and denial
absorbs it — small. If the performing side is handed to a named person by standing arrangement,
claiming goes away and the contact becomes mandatory routing — moderate. If acknowledgement
cannot or should not be recorded, the cycle-time argument survives but loses its diagnosis.
[BDR-0003](bdr/0003-the-authorization-lifecycle.md)

> Nothing stands out

**This headline confirmation was overtaken by your own detailed answers, and the specifics win.**
Three parts of BDR-0003 are gone: rejection (there are none), the denial/rejection distinction,
and the record of when an approver first opened an authorization — you said time in queue per
stage is sufficient, and separately that opening does not mean starting. BDR-0003 is marked
*superseded in part* and [BDR-0005](bdr/0005-correction-in-place-and-revocation.md) replaces those
parts. Nothing was lost by the disagreement: the reversal was priced in advance as small, and it
was. Recorded here so the contradiction is visible rather than quietly resolved in our favour.

### Is there a decision here you would have expected us to make, and we have not?

_Why this matters: silence is the harder failure to catch. We have deferred every technology
choice, the shape of the pilot, and the redesign of the approval sequence — deliberately. If
something you consider settled is missing from this list, it is more likely we have not noticed
it than that we ruled it out._

> Nothing stands out

---

## 8. Raised since the first round

**Not yet asked.** Everything above has been answered; this section holds what has come up since,
and goes out with the round [#32](https://github.com/adam-flores/work-auth-process/issues/32) is
assembling. Same structure as sections 6 and 7: the decision itself, then the beliefs underneath
it.

### BDR-0005 — A defect is corrected in place, and the relay never rewinds for data

Built on your answer that the process is **administrative record-keeping rather than approval**,
and that a defect is *fixed, and continues forward*. Terminal refusal is removed from the model
entirely. When a stage finds something wrong the approver raises a **correction request** against
the named fields; the authorization **does not move** — the stage becomes *awaiting correction*,
the clock keeps running, and the submitter fixes it where it stands. Sign-offs already collected
survive unless the correction touched a field that approver's stage depends on, in which case they
see it again as a **re-review**. Changing the performing department re-routes from the handover.
**Revoked** replaces **Rejected** as the fifth state.

_Reversing it:_ if some stage does hold a genuine veto, a sixth state returns and the error count
gains a category — small. If the authorization should leave the relay while it is being corrected,
the measurement basis for M1 and M3 goes with it — that is the expensive one.
[BDR-0005](bdr/0005-correction-in-place-and-revocation.md)

>

### Does any stage hold a genuine veto?

_Why this matters: this is the question that could unwind the decision above. We removed terminal
refusal entirely on the strength of "not really" — approvers do not refuse outright. Global Trade
is the case we are least comfortable with, because its concern is precisely what is not allowed to
happen. If an export determination can conclude *this must not proceed*, is that a revocation, or
something we have not modelled at all?_

>

### When an approver spots a wrong department, would they expect to fix it themselves?

_Why this matters: we have said no — the approver says precisely what is wrong and the submitter
changes it — so that the person who fills a field stays separate from the person who signs it off.
You described approvers spending real effort helping a submitter get what they need and reach the
right person, which could mean either. If they correct it directly, that is a small change to allow
now and a large one to discover late._

>

### Who, specifically, can revoke an authorization, and when?

_Why this matters: you said nobody but the submitter needs to pause an authorization, but that they
might revoke it. We have allowed any approver whose stage the authorization has reached **or already
passed**, on the reading that the trigger is the wider initiative changing rather than a defect at a
gate. That may be broader than you intended._

>

### Is charging correction time to the stage that found the defect the right picture?

_Why this matters: it decides what your cycle-time numbers will look like. Because a correction does
not move the authorization, a stage's elapsed time includes days the approver was waiting on
somebody else — which makes the stage look slower than the approver was. We chose it because the
alternative loses the time entirely: the authorization leaves and re-enters, every stage records a
short visit, and the days the defect actually cost belong to nowhere. We would rather the total be
honest and the breakdown explain it._

>

### Is whether a department may perform a given piece of work something the system could hold?

_Why this matters: you named two dominant defects — the submitter cannot find the right
department, and the submitter asks a department to do work it is not legally authorized to do. The
second one
is only preventable at entry if the constraint is data rather than judgement, and you said it could
be either. So: what would it take to encode the encodable part, and roughly what share of these
would that catch? Everything it does not catch falls through to an approver four stages later.
[#35](https://github.com/adam-flores/work-auth-process/issues/35)_

>

### Assumptions underneath BDR-0005

One-word reactions are enough; we only need to know which you would push back on.

**A stage's concern can be written down as the set of fields it depends on.** It is what decides
which sign-offs a correction invalidates. The requesting finance approver is the awkward case —
they confirm funding held outside this process, so they depend on no field and their sign-off would
survive every correction.

>

**The performing department is the only field whose correction invalidates a whole side.**

>

**A record of who an authorization passed between *within* a stage is worth collecting.** You
raised this and said it should not be reported on. It is excluded from every measure, and what
such a handoff actually *is* now has its own ticket, because it contradicts our definition of a
stage as occupied by a single role.
[#37](https://github.com/adam-flores/work-auth-process/issues/37)

>

### BDR-0006 — The product records the relay and nothing before it

Built directly on your answers, so the decision itself is settled rather than proposed. Cycle
time runs from **initiation** to completion; time spent drafting is not measured and an
abandoned draft leaves no trace. Every stage records three timestamps — arrived, notified,
resolved — and the fourth we had planned, *when an approver first opened it*, is gone. Held
time is excluded from cycle time and reported separately; time *awaiting correction* stays
in. A stage re-entered as a re-review counts as a separate occurrence rather than inflating
its first pass. M4–M6 are pilot survey items, and the product makes no attempt to approximate
them. An **insights dashboard** for administrators shows the measures over seeded history.

**The consequence worth seeing stated**, because it narrows what the pilot can argue: we can
show which stage the elapsed time built up in and how much of it was the data being wrong,
but not whether the remainder was an approver considering the authorization or the
authorization sitting unopened. Assumption 1 of this project — that most of today's elapsed
time is idle rather than busy — therefore stays an assumption. The 50% target is unaffected.
[BDR-0006](bdr/0006-what-the-product-records.md)

>

### Assumptions underneath BDR-0006

**Nothing about filling the form in needs measuring.** The clock starts at initiation,
abandoned drafts are not counted, and we are not counting guidance being opened. So the
product records nothing at all about the part of the process this business case identifies as
the actual problem. If someone asks how we know the guidance helped, the answer is the pilot
survey and nothing else. We think that is the right call for a prototype; it is worth knowing
you are comfortable defending it.

>

**Holds are rare, and are what they claim to be.** Excluding held time is only safe if a hold
is a submitter pausing their own request. If holding becomes the informal way an approver
parks something, the exclusion hides exactly the delay we are looking for.

>

**"Admin" is a real audience for the insights dashboard.** Every other view in the system is
open to everyone by deliberate decision. This would be the first restricted one — and since
the prototype has no log-in, the restriction is a statement of intent rather than something
built.

>

### BDR-0008 — Finding a department is narrowing on attributes, then searching the rest

Built on your answers that there are **three legal entities**, that **attributes sit at any level**
and simply whittle the list down however makes sense, and that a submitter **self-identifies**
rather than having their own side filled in for them. One screen: narrow by whatever you are
certain of, then search what is left by name. It resolves to a department and derives the two
levels above it, so nothing is keyed in three times. There is no free-text escape — a department
that is not in the hierarchy leaves the request in **Draft** until someone adds it.

You also confirmed that departments carry **nothing about the work they do** — a requester knows
what they are looking for from the department name — so no work-kind taxonomy is needed and
search-by-name is load-bearing rather than a fallback.

_Reversing it:_ if attributes have to be tied to their level, the picker becomes a
legal-entity-then-division cascade and anyone who does not know the division is back to reading a
chart. Contained. If free text is allowed for a department that cannot be found, the permissibility
check cannot run at entry and the wrong-department error resurfaces at a gate instead — that is the
expensive one. [BDR-0008](bdr/0008-finding-a-department.md)

> **Answered 2026-09-12 — `final`.** Recorded for the reviewer; nothing outstanding.

---

## Anything else?

What haven't we asked that we should have? In particular: is there anything about this process
that everyone who works with it knows, that wouldn't appear in any document?

> Nothing stands out

---

## For maintainers

This document accumulates, and it is the **only** collection point — a question that needs a
stakeholder answer belongs here, whichever role it is aimed at. When a provisional BDR is
written, add three things: its _What it assumes_ beliefs, its _Question for the product owner_,
and **the decision itself to section 7** — the beliefs underneath a decision are not a substitute
for asking about the decision. Splitting them across two documents would only work if the two
roles were held by different people, and on this project they are not.

When an answer comes back, record it against the decision it settles — a confirmed BDR moves to
`final`, an overturned one to `superseded`. Answers are paraphrased into the repo, never pasted
verbatim, and nothing from a reply that names a real entity, code, or person enters version
control.
