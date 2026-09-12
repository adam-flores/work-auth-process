# BDR-0011: A within-stage handoff is a referral — it shows the authorization to a colleague without moving it

**Status:** provisional
**Date:** 2026-09-12
**Decided by:** us, provisionally — the product owner delegated it as immaterial at this stage

## Decision

**A handoff within a stage is a *referral*: an approver showing the authorization to a named
colleague, which notifies that colleague and appends a transition, and changes nothing else.**
The authorization does not leave the referrer's queue, the colleague gains no power to act on
it, and the acknowledgement still comes from the person the stage routed to. Referrals are
readable in an authorization's history and **excluded from every measure**, aggregate counts
included.

Two things follow, and they are what make the referral cheap:

**A stage routes to a role at a department, not to a person, and any holder of that role may
acknowledge.** So a program manager who wants a different program manager to handle something
needs no mechanism at all — the colleague is already looking at the same queue and can simply
act. The referral exists for the case a shared queue cannot cover: asking **someone who could
never have held that stage**, the engineer who knows whether the scope is right.

**`CONTEXT.md`'s definition of a stage survives unchanged.** The ticket that produced this
record ([#37](https://github.com/adam-flores/work-auth-process/issues/37)) was raised on the
belief that a within-stage handoff contradicts *"one position in the relay, occupied by a single
role"*. It does not. Two people of one role passing work between them leaves the role intact,
and the person consulted under a referral never signs, so the stage never has two occupants or
two roles. The contradiction the ticket was created to resolve did not exist.

Referral is available to **whoever holds an authorization at their stage**, on any stage, rather
than to approvers only. A rule naming which stages may refer would be more machinery than a
uniform permission, and there is no stage where asking a colleague should be refused.

## Why this, and not the alternatives

**Reassignment — the position moves to the recipient, who then acknowledges.** The reading the
ticket assumed. Rejected because it needs a routing model *inside* a stage that nothing else in
the process wants: queues that move mid-stage, ownership held and transferred below the level of
the relay. It also duplicates work the shared role queue already does, since a same-role
colleague can act without anything being transferred. The product owner's words — a log of who
an authorization *passed between* — describe a circulation, not a transfer of duty.

**Generalize claiming to every stage.** Superficially attractive: one mechanism instead of two.
Rejected because claiming is not a generic hand-over. It exists to **name the owner of the
performing-side fields**, so that a correction request has somewhere to go
([BDR-0003](0003-the-authorization-lifecycle.md),
[BDR-0005](0005-correction-in-place-and-revocation.md)). Approvers own **criteria**, not fields
([BDR-0002](0002-the-cast-and-what-each-role-needs.md)), so there is nothing for an approver to
be named as the owner of, and a claim at an approval stage would be a lock with no purpose.

**Delegation — the colleague acts, the original approver stays accountable.** Rejected as a
distinction with no demand behind it. It is a referral plus a formal transfer of authority, and
nothing in the process asks for the transfer.

**Record nothing; let it happen off-system.** The honest minimum, and it is what the process does
today over email. Rejected because the product owner volunteered the log unprompted, which makes
it a stated requirement rather than something we inferred.

**Report a referral count with no names.** Rejected, and this is the only alternative rejected
on grounds other than cost. A count is the measure that would actually be useful — *authorizations
at this stage were shown to 2.4 people on average* reads as a knowledge-gap signal, which is
close to this project's whole argument. It is also a metric that penalizes asking a colleague for
help, and it makes a department look bad without naming anyone in it. The product owner said the
log should not be reported on; a count is reporting on it.

Note that **the no-individual half needed no new rule.** `CONTEXT.md` already bars the insights
dashboard from attributing anything to a named person
([BDR-0010](0010-an-administrator-maintains-the-hierarchy.md)). What this record adds is the
exclusion of the aggregate.

## What it assumes

**That no stage's acknowledgement carries delegated signature authority tied to a named
individual.** The load-bearing one, and the most likely to be wrong. This record has a stage
routing to a role at a department with any holder able to acknowledge. Aerospace finance
sign-offs often do carry real delegated authority — a threshold, a named signatory, a
delegation-of-authority list. If any stage here does, then a stage has a fixed occupant, a
handoff becomes a genuine transfer of authority, and reassignment is the right model after all.

**Narrowed, 2026-09-12.** Asked whether an approver ever gets someone else to sign in their
place, the product owner answered **yes, occasionally**; the delegated-authority half of the
question was not affirmed. Occasional substitution is already what this model does — a stage
routes to a role, so another holder of that role acknowledging needs no mechanism. So the
assumption survives, reduced to its sharp edge: **the substitute holds the stage's role.** If
the occasional signer is someone who could never have held the stage, the assumption below about
the consulted colleague never signing is wrong, and with it this decision.

**That the colleague consulted never signs.** The scenario in the ticket had the colleague
signing, but that detail was a previous session's illustration and was never stated by anyone.
If in practice the approver forwards it and the colleague acknowledges in their place, this is
wrong in the same way the assumption above is wrong.

**That a referral needs no visibility grant.** It assumes the colleague can already read the
authorization, which holds because every participant sees the whole record and the master
dashboard is open to anyone with access
([BDR-0007](0007-one-project-many-resources.md)). If access were ever scoped, a referral would
have to carry a grant with it and would stop being a pure notification.

**That the reason for not reporting on it is individuals becoming visible.** Inferred from where
the remark was made — in answer to a question about approvers being visible on responsiveness —
rather than stated. The decision does not depend on the reason being right; the exclusion holds
either way.

## Question for the product owner, answered

**Does an approver ever get someone else to sign in their place?** — **Yes, occasionally.**
Occasional rather than standing, which is what the question was for: a stage has no fixed
occupant, so the role-shared queue holds and a handoff still moves a question rather than
authority. The decision stays `provisional` because the product owner delegated the decision
itself rather than confirming it; what is answered is the process fact underneath it.

## What changes if this is overturned

Contained. A referral is a transition kind and a notification, so
[ADR-0004](../adr/0004-transition-log-and-global-relay-config.md)'s append-only log absorbs it
whichever model wins — the log records who it passed between either way, and only the meaning of
the entry changes.

What would *not* be contained is the assumption underneath it. If a stage has a fixed individual
occupant, then queues stop being role-shared, a within-stage routing model has to exist, and
`CONTEXT.md`'s definition of a stage does need the rewrite this ticket suspected. That is the
thing to watch, and it is a question about the process rather than about this decision.

**No ADR.** A referral is one transition kind plus a notification, with no design trade-off to
record and nothing a future reader would wonder about.
