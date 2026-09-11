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

**Full framing, solution direction, targets, and the ask:
[docs/business-case.md](docs/business-case.md).** The original solution-agnostic framing
is preserved unchanged in [docs/source/project-overview.md](docs/source/project-overview.md).

---

## Status

| | |
|---|---|
| **Phase** | Direction set — capability decisions in progress |
| **Solution approach** | Preserve today's approval flow; rebuild the experience around it ([BDR-0001](docs/bdr/0001-preserve-the-flow-rebuild-the-experience.md)) |
| **Tech stack** | React front end, Node services; data store still open (see [`docs/adr/`](docs/adr/)) |

Decisions about *what the system should do* are recorded in [`docs/bdr/`](docs/bdr/) and are
`provisional` until confirmed with the process owner. Decisions about *how it is built* are in
[`docs/adr/`](docs/adr/).

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
├── README.md               You are here
├── CONTEXT.md              The glossary — canonical vocabulary for the domain
├── CLAUDE.md               Working agreements and context for Claude Code
├── docs/
│   ├── business-case.md    The live argument: problem, solution direction, targets, the ask
│   ├── bdr/                Business decision records — what the system should do, and why
│   ├── adr/                Architecture decision records — how it is built, and why
│   ├── process/            The work authorization flow as it stands today
│   ├── reference/          Synthetic fixtures — fictional data of a realistic shape
│   ├── agents/             How agent skills map onto this repo's tools and conventions
│   └── source/             What this was built from — the original business case,
│                           plus real reference documents that are never committed
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
