# Prototype — Resolving a CAS classification

**Throwaway.** This directory exists to answer one question and is not part of the product.
It lives on this branch only and is never merged to `main`.

Ticket: [#9 Resolving a CAS classification](https://github.com/adam-flores/work-auth-process/issues/9)

## The question

How does a user arrive at the correct CAS classification without reading a chart of the
company? Nine of the form's inputs come from a chart that "must be manually analyzed and
entered by the user" — the single largest source of manual effort and transcription error in
the process as it stands.

## How to run it

Open `index.html` in a browser. No build, no server, no install.

Deliberately framework-free: this map defers every technology choice to the mechanics phase
(ADR-0003 is still open), so the prototype must not smuggle a stack decision in. Plain
HTML/CSS/JS with the data inlined.

## What's in it

Three **structurally different** answers to the same task, on one page, switchable with the
floating bar at the bottom (or `←` / `→`, or `?variant=A|B|C`):

| | Variant | Primary affordance | The bet |
|---|---|---|---|
| **A** | Search the hierarchy | One search box over all 58 units | The task is fine, the tool is the problem. Decode the colour channels into words and let people search. |
| **B** | Derived from identity | A pre-filled card to confirm or reject | Asking people to classify *themselves* is the odd part — the organisation already knows. |
| **C** | Guided narrowing | A stack of plain-language questions | Ask about the work and the people, not about CAS, and resolve to a node the user could not have found unaided. |

Two controls are shared across all three, because they are the context the task happens in,
not part of any one design:

- **Requesting / Performing block** — the two sides are not the same problem. The submitter is
  classifying themselves; the performing entity is somebody else. Flip this on variant B in
  particular.
- **The record panel** (right) — the form fields as they would be filled, live. Fields marked
  with a **?** are the ones [#16](https://github.com/adam-flores/work-auth-process/issues/16)
  has not settled; hover for why.

## Data

`docs/reference/cas-hierarchy.json` from `main`, flattened and inlined — 58 units, 3 charts,
entirely fictional (built in [#8](https://github.com/adam-flores/work-auth-process/issues/8)).
Its awkwardness is deliberate and is preserved here: three charts with different shapes and
code schemes, a chart that groups by function instead of by segment, cost centres shared
between units, one unit with no country at all.

## What to look for

The interesting feedback is usually "the search from A with the confirmation step from B".

- **A** — is search enough once the colour channels are spelled out? Try `20514`: three units
  share that cost centre, so the code does not identify the unit.
- **B** — switch to the **Performing block**. Derivation answers the submitter's own side in
  one click and then falls over, because two of the four people in the directory have no unit
  on file. Is the degraded path acceptable, or does it mean B is really "A plus a default"?
- **C** — watch the counts on each option. Outside the affiliated chart, every work-kind answer
  is empty and only "something else" survives: the question filters on a level that only one
  of the three charts actually has.
