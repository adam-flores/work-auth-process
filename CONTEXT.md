# Work Authorization

The internal work authorization process at a large aerospace manufacturer: the record an
employee's department creates when it needs work done by another department, and the relay of
approvals that record passes through before the work can be booked.

This glossary is the vocabulary every decision record, ticket, and module in this repository
uses. Where it disagrees with an older document, this file wins and the older document is
wrong.

## The record

**Authorization**:
The record one department creates to request work from another for **one project**, carrying the
data both sides supply and the approvals it collects. Full name *internal work authorization*,
abbreviated *IWA*. Covers a second project, or work from a second department, only by being a
second authorization.
_Avoid_: form, request, ticket

**Resource**:
One person's worth of work requested on an authorization, carrying its own budget hours and labor
rate. An authorization carries one or more; they share its project, its departments, and its relay.
The employee eventually assigned is a name on the record, not a participant in the process.
_Avoid_: line item, headcount, assignment, allocation

**Permissibility rule**:
A configured pair of departments that may not work together, checked when an authorization is
entered. A property of the *pairing*, not of either department — a department is not incapable, the
combination is not allowed. Held as data so it can be changed without a build.
_Avoid_: restriction, capability, authorization rule, policy

**Requesting department**:
The department that needs the work done and creates the authorization.
_Avoid_: requesting entity, requester, originating department, customer

**Performing department**:
The department whose employee does the work and books time against it. Named on the
authorization by the submitter, not discovered later.
_Avoid_: performing entity, provider, supplier, supplying department

**Funding type**:
What kind of funding or customer contract the requested work supports, stated by the submitter when
the authorization is raised. It is what the **Contracts** gate's condition is read from, which is why
it belongs at intake rather than at the gate. Supplied by the requesting side only.
_Avoid_: contract type, funding source, customer contract, contract vehicle

**Charge number**:
The code the performing team books time against, minted at the final stage. Until it exists,
no work can be booked against the authorization.
_Avoid_: cost code, job number, charge code

## The organization

Three levels identify any department. Settled by
[BDR-0004](docs/bdr/0004-the-classification-is-three-levels.md), which retired the CAS
vocabulary the source form used — *group*, *CAS group*, *CAS segment*, *CAS SBU*, *chart* and
*segment* name nothing in this system.

**Legal entity**:
The outermost level. Holds divisions; three exist. It does *not* separate otherwise similar
departments — a foreign department and a domestic one may sit in the same legal entity. What tells
them apart is an **attribute**, not a position.
_Avoid_: entity, company, SBU, CAS SBU

**Division**:
The level between a legal entity and its departments. An organizational grouping, carrying no
cost-accounting meaning of its own.
_Avoid_: segment, CAS segment, group, business unit

**Department**:
The level work is requested from and performed by, and the only one a user is really looking
for — the two levels above it exist to disambiguate it. Belongs to exactly one division.
_Avoid_: team, unit, supply unit, service center, cost center

**Classification**:
Identifying a department by its three levels. Performed by the submitter for **both** sides, and the
two sides may never be the same. Nothing is pre-filled: the submitter identifies their own
department as deliberately as the one they are requesting work from.
_Avoid_: CAS classification, lookup, coding

**Attribute**:
Anything recorded about a department that helps identify it — whether it is foreign or domestic, and
whatever else the organization holds. Held at **whatever level it belongs to** and inherited
downward, so a department carries its own attributes plus every attribute of the division and legal
entity above it. Attributes are not tied to a level, which is why foreign departments are scattered
through the hierarchy rather than grouped in one part of it. A department's **name** is not an
attribute — it is what search matches on, and it is what tells a requester the work a department
does, since nothing else records that.
_Avoid_: field, property, facet, tag, flag

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

Five states are recorded — **Draft**, **On hold**, **Completed**, **Withdrawn**, **Revoked**.
Where an authorization sits in the relay is **not** one of them — it is read from the relay, so
there is no status anyone maintains by hand. Neither is *awaiting correction*, which is a
condition of a stage rather than a state of the authorization.

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
An initiated authorization killed by its submitter. Terminal. Distinct from **revoked**: withdrawn
means the submitter no longer wants it, revoked means someone else says it must not proceed.
_Avoid_: cancelled, abandoned, deleted, killed

**Revoked**:
An initiated authorization ended by an approver rather than by its submitter. Terminal. Replaces
the *rejected* state, which had no cause once it was established that no stage refuses on the
merits.
_Avoid_: rejected, refused, declined, cancelled

**Transition**:
One recorded change to an authorization, carrying who caused it, what kind it was, and when.
Transitions are appended and never altered; current state is read from them.
_Avoid_: event, update, status change, history entry

**Claim**:
A contributor in the performing department taking an unclaimed authorization from their
queue, which is what names them as that authorization's performing contributor. A submitter may
name a performing-side contact, but that only adds a notification — the department queue stays
authoritative.
_Avoid_: assignment, pickup, allocation

**Acknowledgement**:
An approver accepting an authorization at their stage and passing it forward. It is not a
judgement on the merits of the ask — it records that someone in the area knows work is being
assigned to them. The relay is a sequence of acknowledgements, which is why no stage can refuse.
_Avoid_: approval, acceptance, sign-off, viewed, opened

**Correction request**:
An approver, at their stage, naming the fields at fault on an authorization, with a mandatory
comment to the owner of those fields. The authorization's position does **not** change: the stage
stays where it is and becomes *awaiting correction*.
_Avoid_: denial, rejection, refusal, bounce, kickback, return

**Correction**:
The field's owner supplying the fix — the submitter generally, the performing contributor for
performing-side fields. Made on the authorization where it stands; nothing is sent back and
nothing is re-submitted, because nothing left the relay.
_Avoid_: resubmission, resubmittal, revision, fix, rework

**Re-review**:
An authorization returning to an approver who already acted on it. Two causes: the relay's
configuration changed beneath it, or a **correction** changed a field that approver's stage
depends on. Shown as a re-review rather than as a fresh arrival, and carrying which of the two
happened, so the approver knows whether what moved was the rules or the request.
_Avoid_: re-approval, recheck, second pass

**Revocation**:
An approver ending an authorization outright, with a mandatory comment. Available to any approver
whose stage the authorization has reached *or already passed*, because the cause is usually the
wider initiative changing rather than a defect at a gate. The only refusal in the process, and it
is not a stage's decision.
_Avoid_: rejection, denial, cancellation, veto

## The cast

Three roles, distinguished by what they can do rather than by what they are accountable for.

**Submitter**:
The individual who creates an authorization and owns it for its whole life — receives correction
requests and supplies the corrections. Ownership transfers to another individual; it is never a
seat or a queue.
_Avoid_: originator, issuer, requester, owner

**Contributor**:
A role that fills a section of an authorization. The submitter is the requesting-side
contributor; the performing department supplies its own.
_Avoid_: originator, data entry, filler

**Approver**:
A role that acknowledges an authorization at one stage, or raises a **correction request**
against it. Six exist today: a program manager and a finance approver on each side, plus Contracts
and Global Trade. No approver refuses on the merits; **revocation** is the only way one ends an
authorization.
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
stage, their own unfinished draft, or a **correction request** addressed to them. A list, not a
filter on the record: opening an item shows the whole authorization, and no stage sees less of one
than any other. An authorization
leaves when they act, and an authorization out for correction sits in the corrector's queue only —
the approver who raised the request cannot act on it and follows it on the master dashboard
instead. It holds live work only, so an authorization **on hold** is in nobody's queue. A
department's queue distinguishes **claimed** from unclaimed.
_Avoid_: inbox, worklist, backlog, task list

**Department picker**:
Where a submitter finds a department: narrowing by **attribute** on whatever they are certain of,
then searching what remains by name. One surface, used for both sides. Resolves to a department —
the division and legal entity above it are derived rather than keyed in. Offers no free text, so a
department that is not in the hierarchy leaves the authorization in **Draft** until someone adds it.
_Avoid_: lookup, chart, org browser, search

**Master dashboard**:
The view of every authorization in the system, open to anyone with access and filterable by
submitter, stage, participant, or identifier. Where history is retrieved, since the queue keeps
none.
_Avoid_: search, archive, register, report

**Insights dashboard**:
The aggregate view of how the process is performing — time in each stage, correction requests,
held time — computed from the same records the product writes rather than reported separately.
Restricted to administrators, which makes it the one surface that is not open to everyone. Shows
no individual: nothing on it attributes time or defects to a named person.
_Avoid_: analytics, metrics page, reporting, MI

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
