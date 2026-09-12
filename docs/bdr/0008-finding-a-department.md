# BDR-0008: Finding a department is filtering on attributes, then searching what remains

**Status:** final
**Date:** 2026-09-12
**Decided by:** product owner, on the prototype

## Decision

A user finds a department by **narrowing on attributes they are certain of, then searching what
remains by name** — one screen, not two. This replaces reading a chart, which is what
[the source form](../source/project-overview.md) requires today for nine of its inputs.

**Attributes are not tied to a level.** An attribute hangs wherever it happens to hang — on a
legal entity, on a division, on a department — and a department carries everything held above it as
well as its own. Foreign departments appear scattered through all three legal entities for exactly
this reason; nothing is wrong with the data. Any attribute a department carries can narrow the
list, in whatever combination makes sense to the person narrowing. There is no privileged
attribute and no required order.

**The names carry the meaning.** Departments hold nothing describing the work they do — no
discipline, no service type, no capability list — and none is needed: a requester recognises what
they are looking for from the department's name. This is why search-by-name is the second half of
the design rather than a fallback, and why no work-kind taxonomy has to be invented.

**Filtering is optional.** Certain of nothing is a legal starting state, and search works cold.
Filtering is how people cope with the chart today — foreign and domestic departments have similar
names and narrowing is what keeps them apart — so it is the primary affordance, not an advanced one.

**The picker resolves to a department, and the levels above it are derived.** A department belongs
to exactly one division and a division to one legal entity, so the record holds one reference
rather than three values keyed in separately. This removes a class of transcription error the
source form is exposed to by construction.

**The submitter classifies both sides through the same picker, with nothing pre-filled.** They
self-identify their own department as deliberately as they identify the one they are requesting work
from. Both sides are the same task and the same screen.

**A department that cannot be found is what Draft is for.** The authorization stays in Draft while
the submitter and an administrator resolve it. The picker does not offer free text and does not
route a request anywhere — an unresolvable department is the error this decision exists to prevent,
and the system does not solve its own reference data being incomplete. Who maintains that data is
[#30](https://github.com/adam-flores/work-auth-process/issues/30)'s.

### What the three levels are, on the fixture

`docs/reference/cas-hierarchy.json` was built before
[BDR-0004](0004-the-classification-is-three-levels.md) and reads onto the settled model directly:
its **three charts are the three legal entities**, their segments and categories are **divisions**,
and their units are **departments**. 3, 12 and 58 respectively.

This reverses the obstacle [#8](https://github.com/adam-flores/work-auth-process/issues/8) found.
*"It is not one chart, it is three, and nothing tells you which to open"* was the strongest finding
against a picker being sufficient. Under the settled model it is not an obstacle at all — it is an
attribute with three values, and the user picks it or ignores it like any other. The fixture is
usable for attributes and shape; its CAS vocabulary stays retired.

## Why this, and not the alternatives

**Derivation from the user's identity** (prototype variant B). Rejected twice over. The task that
matters is finding *someone else's* department, where identity has nothing to derive from — the
prototype's own finding, that B answers the submitter's side in one click and then falls over, was
measuring the real task all along. The product owner then closed the remaining half by ruling that
submitters self-identify rather than being pre-filled.

**Search alone** (variant A). Not rejected so much as insufficient on its own. Near-identical
sibling names are the fixture's most faithful irregularity, and name search cannot separate
`Rotor Hubs` from `Rotor Hubs - Pacific` for someone who does not already know which they want.

**Guided narrowing through plain-language questions** (variant C), as a distinct flow. Rejected as
a *structure* while kept as a *behaviour*. The prototype showed C's questions dead-ending on 14 of
30 answer paths because they filtered on a grouping only one chart had. Treating attributes as a
flat, level-agnostic set is what survives of C, and it does not need a question script or a
taxonomy nobody has written.

**Filtering on cost-accounting attributes** — CAS code, cost center, disclosure treatment,
heritage. Rejected on the data before the retired-vocabulary argument applies: each is present on
36 of 58 departments. A filter that is blank for a third of the organization misleads more than it
narrows. Cost centers are additionally disqualified — three departments share `20514`, so the code
does not identify the department.

## What it assumes

**That the attributes in the fixture resemble the real ones in kind.** The decision is about how
attributes behave, not which exist, so it survives the specific set changing. It does not survive
the real hierarchy carrying no usable attributes at all beyond names.

**That people are certain of something.** The whole approach rests on a user knowing *one* true
thing about the department they want. If someone knows nothing except a person's name, this is
search over 58 names and no better than variant A.

**That the two-week draft sweep is acceptable here.**
[BDR-0003](0003-the-authorization-lifecycle.md) deletes a draft two weeks after it was last
modified. A draft parked on a missing department is a draft nobody is modifying, so the sweeper can
take it and the submitter re-keys. Recorded as an accepted cost rather than fixed: exempting it
needs a *blocked on missing department* flag, which is the system solving what was just ruled out
of its scope.

**That foreign/domestic is the jurisdiction attribute, and there is no country.** The source chart
carries no country field at all — foreign versus domestic is encoded in text colour and nothing
narrows it further. The specific countries in `docs/reference/cas-hierarchy.json` are invented
enrichment that the source does not have, and are now labelled as such in
`docs/reference/cas-hierarchy.md`. The picker filters on **foreign/domestic**. Anything finer would
demo a capability the real hierarchy cannot supply.

## What changes if this is overturned

**If attributes must be level-bound**, the picker becomes a cascading tree — legal entity, then
division, then department — and someone who does not know the division is back to reading a chart.
Contained to the picker; nothing else depends on it.

**If the submitter's side is pre-filled after all**, the two sides stop being one screen and the
mocked participants need a department on file. Small, and reversible in either direction.

**If the real hierarchy does carry a country** after all, it becomes one more attribute among the
others and nothing about the design changes — that is the point of attributes not being level-bound.
It would not change the Global Trade gate either: that gate reads the **location type** entered on
each side, not the hierarchy, so its trigger never depended on this.

**If free text is allowed for an unfound department**, the record gains an unresolvable state, the
permissibility check from [BDR-0007](0007-one-project-many-resources.md) cannot run at entry, and
the error this decision prevents is discovered at a gate instead. This is the expensive one.
