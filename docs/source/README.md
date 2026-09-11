# Source material

What this project was built from. Two kinds of thing live here, and the difference matters.

## Committed

- [`BUSINESS_CASE.md`](BUSINESS_CASE.md) — the original business case, written before any
  solution decision was taken. Superseded by the live business case but kept unchanged, so it
  stays visible what was believed before those decisions were made. Its Appendix A holds the
  original project overview, altered only to remove the organization's name.

Safe to commit because it was genericised at the point it was written.

## Never committed

The working-reference documents from the real process — currently a spreadsheet of the
company chart and the flowchart the process document was transcribed from.

These are sensitivity-labelled at source and carry proprietary content: legal entities, cost
centers, CAGE codes, site locations, and CAS/FAR disclosure classifications. They stay on local
disk. The repository's root `.gitignore` excludes them by extension (`*.xlsx`, `*.doc*`,
`*.ppt*`, `*.pdf`).

**If you add a source document in a format the root `.gitignore` does not already cover, add
the pattern before you save the file here.** That file list is the only thing standing between
these documents and a public repository.

## How they are used

Anything the repository needs from the never-committed documents is **transcribed by hand,
genericised, and reviewed** before it is committed. Two artifacts came from them this way:

- [`docs/process/work-authorization-flow.md`](../process/work-authorization-flow.md) — the
  relay, the gates, and the input inventory, with a *Transcription notes* section recording
  exactly what was changed.
- [`docs/reference/cas-hierarchy.json`](../reference/cas-hierarchy.json) — a wholly fictional
  hierarchy of the same *shape* as the real chart, sharing none of its content.

## If a source document is ever committed

Deleting and recreating the repository is the only reliable fix. A force-push does not remove
published history: orphaned commits stay reachable by SHA, and a merged pull request keeps its
diff forever. Act immediately rather than tidying up afterwards.
