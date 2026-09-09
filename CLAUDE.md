# CLAUDE.md

Context and working agreements for Claude Code in this repository.

## What this project is

A prototype for an MBA course project: improving a large aerospace manufacturer's
**internal work authorization process** — the form completed when an employee supports work for another
department.

Read [BUSINESS_CASE.md](BUSINESS_CASE.md) before proposing anything substantive. It defines
the problem, the impact, the desired outcome, and the open questions. It is the source of
truth for *why* this project exists.

This is **not** a real production system and is not affiliated with or endorsed by any
company.

## Current state

The problem is defined; the solution is not. No tech stack, architecture, or solution
approach has been chosen. Do not assume one — if a task implies a stack decision, surface
the decision rather than quietly making it.

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

- **BUSINESS_CASE.md** stays solution-agnostic. It describes the problem and the target
  outcome, not the implementation. Content inferred rather than stated by the user is
  tagged **[Derived]** — preserve that convention, and tag new inferences the same way.
- Appendix A of BUSINESS_CASE.md holds the original project overview, altered only to
  remove the organization's name. Don't edit it further.
- Don't invent metrics, baselines, dollar figures, or stakeholder names. Unknown baselines
  stay `TBD`. This is a business-school deliverable; fabricated numbers are worse than
  blank ones.
- Keep documents in Markdown, wrapped around 95 characters.
