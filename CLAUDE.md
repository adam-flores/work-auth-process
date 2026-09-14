# CLAUDE.md

Context and working agreements for Claude Code in this repository.

## What this project is

A prototype for an MBA course project: improving a large aerospace manufacturer's
**internal work authorization process** — the form completed when an employee supports work for another
department.

Read [docs/business-case.md](docs/business-case.md) before proposing anything substantive. It is
the live argument: the problem, the impact, the desired outcome, the solution direction, the
targets, and the open questions. It is the source of truth for *why* this project exists.

The brief it was written from is [docs/source/project-overview.md](docs/source/project-overview.md)
— the primary source, unaltered except for the organization's name. Read it when you need to
know what was actually stated rather than what has since been inferred from it.

Read [docs/process/work-authorization-flow.md](docs/process/work-authorization-flow.md) for
*what* the process actually does: the routing, the approval gates, the inputs the form
collects, and the manual-lookup problem at the centre of it. It is the reference point every
capability decision is measured against.

This is **not** a real production system and is not affiliated with or endorsed by any
company.

## Current state

The problem is defined and the capability set is settled; the build has not started. The stack
is decided — React on the front end, Node/TypeScript services, and **SQLite** as a file-backed
store ([ADR-0008](docs/adr/0008-sqlite-for-the-prototype-store.md), superseding the open choice
ADR-0003 held between XML and SQLite). The architecture is recorded too: the transition log is
the record, the service is a module with HTTP as a thin adapter over it, and reference data is
split between the store and the repository. See `docs/adr/` for each decision and its reasoning;
read the relevant ADR before working in an area it touches.

The spec for the prototype is
[issue #46](https://github.com/adam-flores/work-auth-process/issues/46). Module boundaries below
the level the ADRs fix are still open — if a task implies a decision that isn't already recorded
in an ADR, surface it rather than quietly making it.

## Git workflow — important

**`main` is protected by convention.** The repository's initial commit is the only commit
made directly to `main`. Everything after it goes through a branch and a pull request.

### The loop

1. **Branch from an up-to-date `main`:**
   `git switch main && git pull --ff-only && git switch -c <type>/<short-description>`
   Types: `feat/`, `fix/`, `docs/`, `research/`, `chore/`.
2. **Commit as you go.** One commit per logical part, not one big commit at the end.
3. **Push immediately after each commit** (`git push -u origin <branch>` on the first).
   Don't leave finished work sitting only on this machine.
4. **Open the PR when the work is complete** — not as a running work-in-progress
   scratchpad. `gh pr create --fill`.
5. **Ask before merging.** Merging to `main` is the user's call, always.
6. **After the user merges:** `gh pr merge --squash --delete-branch`, then immediately
   `git switch main && git pull --ff-only` and delete the local branch. Never cut a new
   branch from a stale `main`.

### Autonomy

- **Commit and push freely** — no need to ask for confirmation on either.
- **Never merge to `main` without explicit approval.**
- **Never commit or push directly to `main`.** If asked to "commit this" while on `main`,
  create or switch to a branch first — and say that you did.

### Merge strategy

Squash and delete the branch. Each PR becomes one clean commit on `main`.

### Commit messages

[Conventional Commits](https://www.conventionalcommits.org/): `type(scope): summary`

- Types: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`
- Imperative mood, lowercase summary, no trailing period
- Keep the subject under ~72 characters; add a body when the *why* isn't obvious
- End with: `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`

```
docs(business-case): add success measures and open questions
```

### Before moving on

Verify nothing is stranded — both should be empty:

```bash
git log --oneline @{u}..HEAD        # unpushed commits
git log --oneline origin/main..HEAD # unmerged work
```

Check branch state against the **live remote** (`git ls-remote --heads origin`), not
local tracking refs, which go stale until `git fetch --prune`. A branch missing from the
remote usually means its PR merged and the branch was deleted — not that work was lost.

## Data handling — important

The underlying process touches cost allocation between legal entities and **foreign
restricted government contracts** subject to US contract requirements.

- Never write real company data into this repository: no actual forms, contract numbers,
  program names, employee names, cost figures, or internal system details.
- Use synthetic or clearly fictional data in all examples, fixtures, and documentation.
- If the user pastes something that looks like real internal or potentially
  export-controlled content, flag it before committing it.

## Writing conventions

- **docs/source/project-overview.md** is the primary source, altered only to remove the
  organization's name. Don't edit it — quote it.
- **docs/business-case.md** is the live business case and the one to update. Content inferred
  rather than stated by the user is tagged **[Derived]** — preserve that convention, and tag new
  inferences the same way. A decision recorded in `docs/bdr/` is not finished until the business
  case reflects it.
- Don't invent metrics, baselines, dollar figures, or stakeholder names. Unknown baselines
  stay `TBD`. This is a business-school deliverable; fabricated numbers are worse than
  blank ones.
- Keep documents in Markdown, wrapped around 95 characters.

## Agent skills

### Issue tracker

Issues live in GitHub Issues on `adam-flores/work-auth-process`, via the `gh` CLI.
See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles, using their default label strings.
See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` and `docs/adr/` at the repo root.
See `docs/agents/domain.md`.
