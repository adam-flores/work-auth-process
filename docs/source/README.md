# Source material

What this project was built from. Two kinds of thing live here, and the difference matters.

## Committed

- [`project-overview.md`](project-overview.md) — the **primary source**: the brief this whole
  project was written from, altered only to remove the organization's name. Everything else in
  the repository derives from it, which is why it is the one source document that is committed.

Safe to commit because it was genericised at the point it was written.

A first-draft business case also lived here, kept for a while so it stayed visible what was
believed before any solution decision was taken. It was retired once
[`docs/business-case.md`](../business-case.md) held everything it did, and once that history had
a better home: each provisional decision in [`docs/bdr/`](../bdr/) records what we assumed and
why, which is more useful than a superseded draft nobody re-reads.

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
