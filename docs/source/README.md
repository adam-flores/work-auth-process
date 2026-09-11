# Source documents

Working-reference documents from the real process. **Nothing in this directory is committed**
except this file and the `.gitignore` beside it.

These documents are sensitivity-labelled at source and carry proprietary content — legal
entities, cost centers, CAGE codes, site locations, and CAS/FAR disclosure classifications.
They stay on local disk as reference material.

## How they are used

Anything the repository needs from them is **transcribed by hand, genericised, and reviewed**
before it is committed. Two artifacts came from them this way:

- [`docs/process/work-authorization-flow.md`](../process/work-authorization-flow.md) — the
  relay, the gates, and the input inventory, with a *Transcription notes* section recording
  exactly what was changed.
- [`docs/reference/cas-hierarchy.json`](../reference/cas-hierarchy.json) — a wholly fictional
  hierarchy of the same *shape* as the real chart, sharing none of its content.

## If a source document is ever committed

Deleting and recreating the repository is the only reliable fix. A force-push does not remove
published history: orphaned commits stay reachable by SHA, and a merged pull request keeps its
diff forever. Act immediately rather than tidying up afterwards.
