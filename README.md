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
| **Phase** | Building — the capability set is settled and the spec is broken into tickets ([#46](https://github.com/adam-flores/work-auth-process/issues/46)) |
| **Solution approach** | Preserve today's approval flow; rebuild the experience around it ([BDR-0001](docs/bdr/0001-preserve-the-flow-rebuild-the-experience.md)) |
| **Tech stack** | React front end, Node services, SQLite store (see [`docs/adr/`](docs/adr/)) |

Decisions about *what the system should do* are recorded in [`docs/bdr/`](docs/bdr/) and are
`provisional` until confirmed with the process owner. Decisions about *how it is built* are in
[`docs/adr/`](docs/adr/).

---

## Running it

Requires **Node 24 or newer** — the server and the tests run TypeScript natively and the store
uses the built-in `node:sqlite`, so nothing is transpiled and nothing is compiled on install.

```bash
npm install
npm start          # builds the web app and serves everything on http://localhost:3000
```

That is the whole setup. The SQLite store is created and seeded on first run; there is no
database to provision and no configuration to supply.

| Command | What it does |
|---|---|
| `npm start` | Build the web app and serve it with the API on one URL |
| `npm run dev` | Vite dev server with hot reload (run `npm run dev:api` alongside it) |
| `npm run reset` | Return the store to its seeded state |
| `npm test` | Drive the service in-process against a real store on a temporary file |
| `npm run test:e2e` | Playwright, against a browser (`npx playwright install` first) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run security-scan` | The SEC-5 scan, over the working tree rather than the staged diff |

**The store is disposable.** It is rebuilt by seeding rather than migrated
([ADR-0008](docs/adr/0008-sqlite-for-the-prototype-store.md)), so `npm run reset` — or deleting
`.store/` — always gets you back to a known state. Nothing in it is worth keeping.

**The security scan runs on every commit.** `npm install` points git at `.githooks/`, so the
pre-commit hook is live on a cold clone without anyone remembering to enable it. It covers the
four targets SEC-5 names: secrets, dependency advisories, code-level patterns, and confidential
or export-controlled content. Terms specific to the real organization go one per line in
`.security-terms`, which is gitignored — a scanner that hardcodes the client's name would defeat
the rule it exists to enforce. Installing `semgrep` upgrades the third target from built-in
patterns to a full ruleset.

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
├── src/
│   ├── shared/             Rules expressed once, imported by the browser and the service
│   ├── store/             SQLite: schema, seeding, and the disposable store file
│   ├── service/            The seam — every process decision, as typed functions
│   ├── server/             A thin HTTP adapter over the service; holds no logic
│   └── web/                The React app
├── config/                 Reference data that ships with the repo, not the store
├── tests/
│   ├── service/            The single seam for process logic
│   └── e2e/                Playwright, for what the seam cannot express
├── scripts/                Store reset, and the SEC-5 security scan
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
