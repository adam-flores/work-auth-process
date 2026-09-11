# BDR-0005: A defect is corrected in place, and the relay never rewinds for data

**Status:** provisional
**Date:** 2026-09-11
**Decided by:** us, on the product owner's answers
**Supersedes:** [BDR-0003](0003-the-authorization-lifecycle.md) in part — the Rejected state,
the denial/rejection distinction, and resubmission

## What the process is for

The relay **acknowledges; it does not judge**. Whether work happens at all is approved or denied
through entirely different mechanisms, and this process never touches that question. It exists
to do two things:

- **Stop what is not legally allowed to happen** — for a range of reasons, of which export
  jurisdiction is only the most visible.
- **Keep the financial ledger honest**, by allocating work to the department that originated it.

The sign-offs exist so that nothing is assigned to an area without someone there acknowledging
it. That is why an acknowledgement relay is a real control rather than ceremony, and it is the
frame every decision below is measured against.

## Decision

**No approver refuses an authorization on its merits.** The **Rejected** state of
[BDR-0003](0003-the-authorization-lifecycle.md) has no cause and is removed.

**When a stage finds something wrong, the approver raises a correction request.** It names the
fields at fault and carries a mandatory comment to the owner of those fields.

**The authorization's position does not change.** The stage it sits at stays its position and
becomes *awaiting correction*. No stage boundary is crossed, so the relay never rewinds for a
data problem. When the correction lands, the same approver resumes.

**The submitter corrects it**, generally — the owner of the field otherwise, which on the
performing side is the performing contributor. An approver states precisely what is wrong and may
supply the value to use, but does not write it: the role that fills a field and the role that
judges it stay separate, as [BDR-0002](0002-the-cast-and-what-each-role-needs.md) settled.

**It sits in the corrector's queue only.** It leaves the approver's queue, because a queue holds
what is waiting on *your* action and an approver cannot act on it. The approver follows it on the
master dashboard.

**The stage's clock keeps running, and *awaiting correction* is recorded as its own interval.**
A stage's elapsed time therefore decomposes into time the approver held it and time it was out
for correction. The days a defect costs stay attached to the stage that found it.

**A correction to a field an already-passed stage depends on returns it to that stage as a
re-review.** Each stage declares, in the relay configuration, which fields its concern rests on.
This is the mechanism [ADR-0004](../adr/0004-transition-log-and-global-relay-config.md) already
built for the relay's configuration changing beneath an authorization, now serving a second
cause: the data changing beneath it. The shape is
[ADR-0005](../adr/0005-field-dependencies-drive-re-review.md).

**Changing the performing department re-routes from stage 2.** It is the loudest case of the rule
above and the error the product owner named as the one that actually happens. Performing-side
contributions and acknowledgements are superseded in the transition log rather than erased;
requesting-side stages are untouched. A sign-off from a department that is not doing the work
cannot be allowed to stand, and nothing returns to the start.

**Revocation is a terminal state.** Any approver whose stage the authorization has reached **or
already passed** may revoke it, with a mandatory comment. **Revoked** replaces **Rejected**, so
five states are still recorded: Draft, On hold, Completed, Withdrawn, Revoked.

**Whether a department may perform a given piece of work is sometimes a lookup and sometimes a
judgement.** The product encodes what is genuinely encodable and surfaces the attributes where it
is not; the correction loop is the safety net either way. What the system holds about a department
is not settled here — see
[#35](https://github.com/adam-flores/work-auth-process/issues/35).

### What counts as an error

Owed to [#13](https://github.com/adam-flores/work-auth-process/issues/13), which was blocked on
it. Four things could be counted and they are not the same:

| | Counted? | |
|---|---|---|
| **Correction request** at a stage | **Yes** | a defect got past entry and cost days downstream |
| **Validation failure** at entry | Reported separately | the product did its job; nothing reached an approver |
| **Re-review** | No | the rules or the data moved beneath a stage; nobody erred |
| **Revocation** | No | the ask died; not a defect |

- **M1, first-pass acceptance** — the share of authorizations reaching Completed with zero
  correction requests.
- **M3** — correction requests per authorization, replacing *resubmissions per authorization*.
- **Entry catches are reported as a prevention count**, never folded into the error rate.

### Vocabulary

`CONTEXT.md` carries the terms. **Denial**, **rejection** and **resubmission** all move to
`_Avoid_`: nothing is refused, nothing returns to the submitter, and nothing is re-submitted
because it was never un-submitted. In their place: **correction request**, **correction**, and
**revocation**.

This overrides an earlier call that made *denial* canonical specifically because it was the word
the business used. That was the right instinct on the evidence then available; the business has
since disowned the meaning, and keeping the word would buy fidelity to a phrase at the cost of
fidelity to the process. Recorded here rather than changed quietly.

## Why this, and not the alternatives

**Returning the authorization out of the relay and re-entering it at the same stage.** This is
BDR-0003's denial with the trip back to stage 1 removed, and it was the leading alternative. It
loses the time. If the authorization leaves stage 4 on Tuesday and re-enters it on Thursday, stage
4 records two short visits and the two days the defect cost belong to no stage at all — every
stage looks fast while the total stays slow, which is the exact shape of the problem this project
exists to make visible. Pinning the position keeps the total honest, and recording *awaiting
correction* as its own interval keeps the diagnosis: *the approver was slow* stays separable from
*the data was wrong*.

**Pausing the stage clock during a correction.** Rejected for the same reason, more sharply: it
makes cycle time look best precisely when the process performed worst.

**Letting the approver correct the data directly.** Genuinely attractive — the approver is often
the one who knows the right department, and a round trip for a typo is real friction. Rejected
because it lets an approver acknowledge data they authored, which is the one thing a sign-off
regime exists to prevent. The behaviour the product owner described — an approver spending effort
helping the submitter get what they need and reach the right person — is fully served without
edit rights. If trivial corrections turn out to dominate, the narrow fallback is to let an
approver fix their own side's routing data only.

**Keeping *denial* and redefining it.** Rejected; see *Vocabulary* above.

**Treating an impermissible department pairing as terminal.** Considered and rejected. Asking the
wrong department is a wrong value, not a dead request, and nothing in the current process kills an
authorization over it. It is a correction like any other — preferably one caught at entry.

**Counting entry validation failures as errors.** Rejected as perverse: the better the entry
guidance gets, the more errors the product would report. But they are not made invisible either —
a pilot that can say *n defects were caught at entry and m still got through* makes a far stronger
argument than one that reports only the survivors.

**Folding revocation into Withdrawn with the actor recorded.** Rejected. *Withdrawn* means the
submitter no longer wants this; *revoked* means someone with standing says it must not proceed.
For a control process whose stated purpose is stopping what is not allowed, that distinction is
the interesting half. Restricting revocation to the current stage's approver was also rejected —
the trigger described is the wider initiative changing after the fact, which would leave an
approver who has already passed it watching something they know is dead.

## What it assumes

**That nothing in the relay ever needs to refuse.** Taken directly from the product owner: effort
is approved or denied elsewhere, and approvers do not refuse outright. If a stage does hold a
genuine veto — Global Trade is the obvious candidate, given that its concern is precisely what is
not allowed to happen — then revocation is carrying weight it was not designed for, and a true
terminal refusal comes back.

**That a stage's concern can be expressed as a set of fields it depends on.** The re-review rule
rests on it. An approver whose judgement rests on something not on the form at all — the
requesting finance approver confirms funding that exists outside this process — has no field
dependency to declare, and their sign-off therefore survives every correction. That may be right,
or it may mean their concern is under-modelled.

**That correction time is worth attributing to a stage rather than to the submitter.** The model
charges the delay to the stage that found the defect. An alternative reading is that the delay
belongs to whoever entered the bad data, which would produce a very different picture of where
time goes.

**That the performing department is the only field whose correction invalidates a whole side.**
Other fields may turn out to have the same reach.

**That "not legally allowed" is knowable from the authorization.** The permitted-work constraint
is treated as data where it can be and as judgement where it cannot. If it is *always* judgement,
the entry-validation half of the error argument weakens considerably.

## Question for the product owner

1. **Does any stage hold a genuine veto?** We have removed terminal refusal entirely on the basis
   that approvers do not refuse outright. Global Trade is the case we are least sure of: if an
   export determination can conclude *this must not happen*, is that a revocation, or something
   we have not modelled?
2. **When an approver spots a wrong department, would they expect to fix it themselves?** We have
   said no — they tell the submitter precisely what is wrong and the submitter changes it — to
   keep the person who fills a field separate from the person who signs it off. If in practice
   approvers correct routing data directly, say so; it is a small change to allow and a large one
   to discover late.
3. **Who, specifically, can revoke?** We have allowed any approver at or before the current stage.
   That may be broader than you want.
4. **Is charging correction time to the stage that found the defect the right picture?** It means
   a stage's elapsed time includes days the approver was waiting on someone else. We think that is
   the honest total, but it makes a stage look slower than its approver was.

## What changes if this is overturned

**If a terminal refusal does exist**, a sixth state returns and the error definition gains a
category. Small: the correction mechanism is unaffected, and revocation already supplies the
terminal transition shape.

**If approvers may correct directly**, the correction request becomes optional rather than the
only route, and the audit trail has to distinguish who changed each field. Small in the model,
moderate in the interface.

**If position should move out of the relay during a correction**, the *awaiting correction*
interval disappears and M1/M3 lose their basis. That is the load-bearing choice here and the
expensive one to reverse — everything about how time is attributed rests on it.

**If field dependencies cannot be declared per stage**, the re-review rule degrades to a blunt
alternative: either every correction re-runs the whole relay, or none does.
[ADR-0005](../adr/0005-field-dependencies-drive-re-review.md) holds that shape and is the thing
that would change.
