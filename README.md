# Work Authorization Process

A prototype exploring a better way to complete a large aerospace manufacturer's
**internal work authorization form** — the form an employee fills out when they support work for another
department.

Built as a graduate (MBA) course project.

---

## The problem in one paragraph

Completing the internal work authorization form correctly is hard. Training is limited,
guidance is unclear, and there is no easily accessible process support at the moment someone
is filling the form out. So employees ask one of a handful of people who actually know the
process. That produces repeated questions, corrections, resubmissions, and one-on-one
explanations — which delays work authorization, pulls experts away from their real jobs, and
concentrates critical process knowledge in a few heads.

The goal is a process where employees complete the form accurately with minimal assistance.

**Full framing, impact, success measures, and open questions: [BUSINESS_CASE.md](BUSINESS_CASE.md).**

---

## Status

| | |
|---|---|
| **Phase** | Initialization — problem defined, solution not yet designed |
| **Solution approach** | Not yet chosen |
| **Tech stack** | Not yet chosen |

The business case is deliberately solution-agnostic. Nothing about the implementation has
been decided yet.

---

## ⚠️ Data handling

This is a **class prototype**, not a real production system, and it is not affiliated with
or endorsed by any company.

The underlying process touches cost allocation across legal entities and **foreign restricted
government contracts** subject to US contract requirements. Accordingly:

- **Do not commit real company data** — no actual forms, contract numbers, program names,
  employee names, cost figures, or internal system details.
- Use **synthetic or clearly fictional sample data** for everything in this repository.
- Treat anything potentially export-controlled as out of scope for this repo entirely.
- When in doubt, leave it out and describe the shape of the data instead of the data itself.

`.gitignore` blocks common spreadsheet and raw-data paths as a backstop, but the real control
is judgment before `git add`.

---

## Repository layout

```
.
├── README.md          You are here
├── BUSINESS_CASE.md   Problem, impact, desired outcome, success measures
├── CLAUDE.md          Working agreements and context for Claude Code
└── .gitignore
```

---

## Contributing workflow

**`main` is protected by convention.** The initial commit is the only commit made directly
to `main`. Everything after it goes through a branch and a pull request.

```bash
# start from an up-to-date main
git switch main && git pull --ff-only
git switch -c <type>/<short-description>

# ... work, committing each logical part and pushing as you go ...
git push -u origin <branch>

# open the PR once the work is complete
gh pr create --fill

# after review, squash-merge and clean up
gh pr merge --squash --delete-branch
git switch main && git pull --ff-only
```

**Conventions**

| | |
|---|---|
| Branch names | `feat/`, `fix/`, `docs/`, `research/`, `chore/` |
| Commit messages | [Conventional Commits](https://www.conventionalcommits.org/) — `type(scope): summary` |
| Commit size | One commit per logical part; push as you go |
| Merge strategy | Squash, then delete the branch |
| PR timing | Open when the work is **complete**, not as a scratchpad |

Full detail, including the checks that catch stranded work, lives in [CLAUDE.md](CLAUDE.md).
