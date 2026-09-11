# Work Authorization

The internal work authorization process at a large aerospace manufacturer: the record an
employee's department creates when it needs work done by another department, and the relay of
approvals that record passes through before the work can be booked.

This glossary is the vocabulary every decision record, ticket, and module in this repository
uses. Where it disagrees with an older document, this file wins and the older document is
wrong.

## The record

**Authorization**:
The record one department creates to request work from another, carrying the data both sides
supply and the approvals it collects. Full name *internal work authorization*, abbreviated
*IWA*.
_Avoid_: form, request, ticket

**Requesting entity**:
The department that needs the work done and creates the authorization.
_Avoid_: requester, originating department, customer

**Performing entity**:
The department whose employee does the work and books time against it.
_Avoid_: provider, supplier, supplying department

**Charge number**:
The code the performing team books time against, minted at the final stage. Until it exists,
no work can be booked against the authorization.
_Avoid_: cost code, job number, charge code

## The relay

**Relay**:
The ordered sequence of stages an authorization passes through. No stage begins before the
previous one closes.
_Avoid_: workflow, pipeline, chain

**Stage**:
One position in the relay, occupied by a single role, on a single side, with a single concern.
_Avoid_: step, phase, level

**Gate**:
A stage that occurs only when its condition holds. Two exist: Contracts and Global Trade.
_Avoid_: conditional step, checkpoint

## The lifecycle

Five states are recorded. Where an authorization sits in the relay is **not** one of them — it
is read from the relay, so there is no status anyone maintains by hand.

**Draft**:
An authorization its submitter has created but not yet initiated. Visible like any other, in its
submitter's queue and on the master dashboard. Deleted by its submitter, or by the system two
weeks after it was last modified.
_Avoid_: unsubmitted, work in progress, incomplete

**Initiation**:
The submitter releasing a draft into the relay. The audit trail starts here; nothing before it
is preserved.
_Avoid_: submission, kickoff, launch

**On hold**:
An initiated authorization paused by its submitter. In nobody's queue while held, and it resumes
at the stage it left. Only the submitter holds it and only the submitter releases it.
_Avoid_: paused, suspended, parked, frozen

**Completed**:
The terminal state reached when the Charge Number Admin mints the charge number. Caused by a
value existing, not by a final judgement.
_Avoid_: approved, closed, done, finished

**Withdrawn**:
An initiated authorization killed by its submitter. Terminal.
_Avoid_: cancelled, abandoned, deleted, killed

**Transition**:
One recorded change to an authorization, carrying who caused it, what kind it was, and when.
Transitions are appended and never altered; current state is read from them.
_Avoid_: event, update, status change, history entry

**Claim**:
A contributor in the performing entity taking an unclaimed authorization from their department's
queue, which is what names them as that authorization's performing contributor. A submitter may
name a performing-side contact, but that only adds a notification — the department queue stays
authoritative.
_Avoid_: assignment, pickup, allocation

**Acknowledgement**:
An approver first opening an authorization that has arrived at them. Separates time it sat
unopened from time it spent under consideration.
_Avoid_: viewed, read, seen, opened

**Denial**:
An approver returning an authorization to its submitter over something **fixable**. Always
carries a comment addressed to them. Not terminal: correcting and resubmitting is the only
appeal there is. Distinct from a **rejection**.
_Avoid_: rejection, refusal, bounce, kickback

**Rejection**:
An approver refusing an authorization on **the merits of the ask** rather than over a fixable
defect. Terminal — there is no path back out of it, and an authorization rejected in error is
replaced by a new one, not reopened.
_Avoid_: denial, refusal, decline

**Resubmission**:
An authorization sent back into the relay by the submitter after a denial, carrying the
submitter's comment.
_Avoid_: resubmittal, revision, re-review

**Re-review**:
An authorization returning to an approver who already acted on it, because the relay's
configuration changed beneath it. Shown as a re-review rather than as a fresh arrival, so the
approver knows what changed is the rules and not the request.
_Avoid_: re-approval, recheck, second pass

## The cast

Three roles, distinguished by what they can do rather than by what they are accountable for.

**Submitter**:
The individual who creates an authorization and owns it for its whole life — receives denial
comments, resolves them, and resubmits. Ownership transfers to another individual; it is never
a seat or a queue.
_Avoid_: originator, issuer, requester, owner

**Contributor**:
A role that fills a section of an authorization. The submitter is the requesting-side
contributor; the performing entity supplies its own.
_Avoid_: originator, data entry, filler

**Approver**:
A role that accepts or denies an authorization at one stage. Six exist today: a program manager
and a finance approver on each side, plus Contracts and Global Trade.
_Avoid_: reviewer, signatory, gatekeeper, authorizer

**Charge Number Admin**:
The role that mints the charge number and thereby completes the authorization. Not an approver:
it supplies a value rather than rendering a judgement.
_Avoid_: issuer, minter, administrator

**Concern**:
What a particular approver judges — scope, funds available, cost estimate, contract terms,
export. Two approvers may hold identical capabilities and differ only in concern; it is what
tells their stages apart.
_Avoid_: role, responsibility, remit, discipline

## What people see

**Queue**:
A list of authorizations waiting on someone's action — whatever put them there: arrival at their
stage, their own unfinished draft, or a denial returned to them. An authorization leaves when
they act and re-enters on resubmission. It holds live work only, so an authorization **on hold**
is in nobody's queue. A department's queue distinguishes **claimed** from unclaimed.
_Avoid_: inbox, worklist, backlog, task list

**Master dashboard**:
The view of every authorization in the system, open to anyone with access and filterable by
submitter, stage, participant, or identifier. Where history is retrieved, since the queue keeps
none.
_Avoid_: search, archive, register, report

**Notification**:
A push to a role when an authorization arrives in their queue. The queue is what people are
told about; the master dashboard is what they go and look at.
_Avoid_: alert, reminder, email

## Correctness

**Criteria**:
The conditions a field must satisfy to pass a given approver, authored and owned by the role
accountable for that judgement rather than by whoever builds the form.
_Avoid_: rules, validation rules, requirements

**Field guidance**:
The written explanation attached to a field, authored by the role that owns its criteria,
stating what is needed and why.
_Avoid_: help text, tooltip, hint, documentation

## Project roles

Not participants in an authorization — nobody here appears in the relay. These are the two
roles **this project** answers to. They are distinct roles that may well be held by the same
person; the distinction matters because they are asked different kinds of question.

**Process owner**:
The individual accountable for achieving the objectives the work authorization process exists
to serve. Authority over how the process runs. The source of truth for how it works today, what
it costs, and which of its requirements are compliance-mandated rather than convention —
so the role that corrects a factual assumption.
_Avoid_: process manager, business owner, stakeholder

**Product owner**:
The individual accountable for the design and ownership of the system that facilitates the
process. Authority over what the system should do — so the role that confirms or overturns a
business decision record.
_Avoid_: sponsor, client, stakeholder, owner

**Where each is asked:** a BDR's *What it assumes* section lists beliefs about the process,
which the process owner corrects. Its *Question for the product owner* puts the decision itself,
which the product owner settles. A decision can survive its assumptions being wrong, and an
assumption can be right under a decision that gets overturned — which is why the two are asked
separately even when one person answers both.
