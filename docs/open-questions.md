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

**Two roles, one person.** The *process owner* is accountable for achieving the objectives the
process serves and is the source of truth for how it works today. The *product owner* is
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
and is the one that matters most — if you only answer one section, answer that one.

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

>

### Does a given department always map to the same chart unit, or can it vary?

_Why this matters: it decides whether this is solvable at all by automation. If the mapping is
fixed, we build the lookup table once and nobody ever opens the chart again. If it depends on
the work, the funding, or the site, then it is a judgement and the product has to help someone
reason rather than help them search._

>

### If the mapping is fixed — does that table exist anywhere today?

>

### The form asks for four lookup levels (group, CAS group, CAS segment, CAS SBU, legal entity). The chart supplies three (chart, segment, unit). Which form field does each chart level answer?

_Why this matters: we have four labels and three things to put in them, and we cannot tell
whether "unit" answers the SBU field, the legal-entity field, or both at once._

>

### Is "group selection" — asked on the requesting side only — the same thing as "CAS group," or a different field entirely?

>

### How does someone currently know which of the three charts to open?

_Why this matters: the three charts share no layout and no code scheme, and nothing on the form
says which one applies. We can't tell whether this is genuinely ambiguous or whether everyone
just knows._

>

### When someone gets this wrong today, what goes wrong downstream, and who catches it?

>

---

## 2. Where the time actually goes

The business case targets a 50% reduction in cycle time while deliberately leaving the approval
sequence unchanged. That only works if most of today's elapsed time is waiting and rework rather
than work. This is the most load-bearing assumption in the project.

### When an authorization takes a long time, where does the time go — approvers working through it, or the form sitting somewhere waiting to be noticed, or coming back for correction?

_Why this matters: if the six approval steps are genuinely busy end to end, the cycle-time target
is unreachable and our central decision was wrong. We would rather find that out now._

>

### Is preserving the existing sign-off sequence a requirement, a preference, or simply how it has always been? **[product owner]**

>

### Would you rather have a tool that makes today's process work well, or a proposal for a different process? **[product owner]**

_Why this matters: we assumed the first and parked the second. Both are legitimate projects, but
they are different projects._

>

### Roughly how long does an authorization take end to end today — and how long does it take when it goes badly?

>

---

## 3. What people can see, and what happens on a denial

We have proposed that every authorization is readable by anyone with access, and that approvers
see only what they need to act. Both rest on assumptions about sensitivity.

### Are the labor figures on the form average rates, or actual compensation?

_Why this matters: we have assumed averages. If actual pay appears on an authorization, then
making every record openly readable is wrong and visibility has to be restricted instead._

>

### Is there anything else on an authorization that one legal entity would not want another to read?

_Why this matters: cost allocation between entities is exactly the kind of thing business units
can be guarded about. We have assumed nothing here is sensitive, which may be naive._

>

### When an approver denies an authorization today, do they give a written reason — and does it reliably reach the person who submitted it?

_Why this matters: we have assumed a written comment is mandatory and always reaches the
submitter. If it doesn't today, that gap may be a large part of the rework problem._

>

### When something is denied, does it go back to the start, or resume where it stopped?

>

### Can a later approver reject something an earlier approver already passed?

>

### What does the requesting finance approver actually approve?

_Why this matters: the flow has them approving a budget at stage 1, but the budget hours and
labor rate are entered by the performing side at stage 2 — so at their step, there is no budget
on the form yet. We have assumed they are confirming funds against something held outside this
process._

>

### Is the employee assigned to the work ever involved before the charge number exists?

>

### Do approvers ever refuse an authorization outright, rather than returning it for correction?

_Why this matters: we have split the two. A **denial** concerns something fixable — you correct
it and resubmit, and that is the only appeal there is. A **rejection** concerns the merits of
the ask and ends the authorization for good. If in practice everything is a correction request
and a dead authorization is simply one nobody resubmits, then one of those two states has no
cause and we should drop it. If both do happen, what makes an approver do one rather than the
other?_

>

### Would it be acceptable to record when an individual approver first opens an authorization?

_Why this matters: this is the one question here that is about your organization rather than
your process. Our whole cycle-time case rests on most of the elapsed time being idle rather than
busy — and the only way to show that rather than assert it is to record when an authorization
arrived, when the approver was notified, when they first opened it, and when they acted. That
also makes individual approvers visible on how quickly they respond. If that would make this
harder to sell internally, say so: we lose the ability to tell waiting from working, but the
target itself survives._

>

### Can anyone other than the submitter pause an authorization?

_Why this matters: we have proposed that a submitter can put an authorization on hold — it
leaves everyone's queue, and resumes at the stage it left. We have assumed nobody else can do
that. If an approver, a program manager, or a finance lead can legitimately suspend work, we
have the wrong model._

>

### How does the receiving department know the ask is for them?

_Why this matters: this is now blocking work. Nothing in the source material says how an
authorization reaches the performing side. The form's inputs list carries no field naming the
performing department, and the process flow shows the handover only as an arrow between stages 1
and 2. So we think intake happens out-of-band today — the submitter already knows who they are
asking and tells them, and the form documents the ask rather than delivering it. If that is
right, the system has to introduce something the paper process never had, and we cannot design
the performing side until we know what. Please describe what actually happens between "I need
another department to do this" and that department knowing about it._

>

### When work reaches a performing department, is there a queue anyone there can pick from, or is it handed to a named person by prior arrangement?

_Why this matters: at the moment the authorization is handed over, no performing-side person is
named on it — every performing name is a field that side fills in afterwards. We have proposed a
shared department queue that anyone there can claim from. If instead it goes to a specific person
by standing arrangement, the handover works differently._

>

### Is two weeks the right life for an untouched draft?

_Why this matters: we have proposed that a half-filled draft nobody has touched for two weeks is
deleted. That number is ours, with nothing behind it, and it deletes rather than archives._

>

---

## 4. Discrepancies in the source document

These were found while transcribing the process flow by hand and recorded as-found rather than
corrected, so the transcription stays faithful. Each is probably a small error in the source —
but we would rather confirm than assume. Quick yes/no answers are fine.

### The performing entity's legal-entity field is labelled "Requesting Legal Entity" — the same string as the requesting block. Copy-paste error, or does the performing side genuinely record the requesting entity there?

>

### The stage numbering runs 1, 2, 3, 4, 4, 5. Are Global Trade and Performing Admin one stage or two?

>

### Global Trade validates an export classification "selected by the originator," but no such field appears in the form's inputs. Where does that selection actually happen?

>

### The Contracts gate names three funding types — Commercial, FAR 12, FAR 15 — but no routing difference between them. Do all three follow the same review path?

>

---

## 5. Sizing the problem

These fill the baselines currently sitting at `TBD` in the business case. Orders of magnitude are
fine; we are not going to publish precise figures.

### Roughly how many authorizations are raised per month?

>

### Roughly what share of them come back for correction at least once?

>

### Which fields drive the majority of errors?

_Why this matters: we have assumed it's the nine lookup fields. If it's actually the budget
figures or the approver names, the solution is aimed at the wrong target._

>

### What does a single rework cycle cost, in expert time and in schedule delay?

>

### How much of an expert's week goes to answering questions about this form?

>

### Which requirements on the form are compliance-mandated, and which are organizational convention?

_Why this matters: it tells us what genuinely cannot be changed versus what merely has not been._

>

### What distinguishes a foreign restricted government contract submission from a standard one, from the submitter's point of view?

>

---

## 6. Assumptions we are building on

Not questions so much as statements to agree or disagree with. A one-word reaction to each is
enough; we only need to know which ones you'd push back on.

### The form is a legitimate and necessary control. The goal is to make it easier to complete correctly, not to eliminate it.

>

### Everything needed to complete the form correctly is knowable at the time of submission.

>

### The failure mode is knowledge access, not unwillingness — so better guidance at the point of entry is a viable lever.

>

### Your approvers would write down what they check for, and keep it current.

_Why this matters: we have proposed that each approver owns the written criteria for the fields
they judge. That is a behavioural bet, not a technical one, and it is the weakest joint in our
consistency argument. If they wouldn't, the expertise problem moves rather than dissolves._

>

### The employee assigned to the work is a name on a form, not a participant — they take no action in the process.

>

### Legal entities use different reporting systems, so no single common system of record can be assumed.

>

---

## Anything else?

What haven't we asked that we should have? In particular: is there anything about this process
that everyone who works with it knows, that wouldn't appear in any document?

>

---

## For maintainers

This document accumulates, and it is the **only** collection point — a question that needs a
stakeholder answer belongs here, whichever role it is aimed at. When a provisional BDR is
written, add both its *What it assumes* beliefs and its *Question for the product owner* here;
splitting them across two documents would only work if the two roles were held by different
people, and on this project they are not.

When an answer comes back, record it against the decision it settles — a confirmed BDR moves to
`final`, an overturned one to `superseded`. Answers are paraphrased into the repo, never pasted
verbatim, and nothing from a reply that names a real entity, code, or person enters version
control.
