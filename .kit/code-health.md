# Code health

These rules exist so any agent (or human) can navigate the codebase without losing the thread.
Enforce them via `make health` and `make check`. Rules are checked automatically by hooks after edits.

## Modularity first

**Prefer 20 files at 500 LOC over 1 file at 5,000 LOC.** Split early, not after the health check
forces you. The file size limits below are a safety net — they should rarely trigger if you start
with the right structure.

When creating a new feature, begin with separate files for separate concerns:

- One file per entity, system, or service — not one file per "phase of development"
- Config and constants in their own file from the start
- Types/interfaces in a dedicated file once there are more than a handful

**Why this matters:** LLM agents work best with focused, single-responsibility files. A 300-line
file with one clear job is easy to read, edit, and test in isolation. A 1,000-line file that
"will be split later" rarely gets split — it just grows. Starting modular costs almost nothing;
retroactive splitting costs a full refactor session.

**The anti-pattern:** building a working prototype in a single file, then splitting after the fact.
This is expensive because it requires re-wiring imports, moving tests, and updating references —
work that wouldn't exist if the structure was right from the start.

## Entry point discipline

`main.ts` (or equivalent) should initialize the app and delegate — never contain business logic.
Target: **under 50 LOC**. If your main file is growing, you're wiring things in the wrong place.

Pattern: `main.ts` → launcher/app setup → scene/route/controller. Each layer delegates to the
next. This prevents main from becoming a dumping ground for every new feature.

## Test parity

When you create a new source file, create its test file in the same commit. Don't batch test
creation for "later" — later never comes, and untested files accumulate silently.

The health check warns when source files have no corresponding test. Not every file needs
deep tests (thin rendering wrappers may just need a smoke test), but every file should have
_something_ that breaks if the file's contract changes.

## Commit size

If a single commit touches more than ~20 files or adds more than ~1,000 LOC, it probably should
have been multiple commits. Large commits are hard to review, hard to revert, and hard for agents
to learn from in `git log`.

Break work into logical units: one commit per feature, one for the refactor, one for the tests.
This also makes `CHANGES.md` entries more meaningful.

## File size limits

| Type        | Soft limit | Hard limit |
| ----------- | ---------- | ---------- |
| Source file | 250 LOC    | 350 LOC    |
| Test file   | 400 LOC    | 500 LOC    |
| Config file | 100 LOC    | 150 LOC    |

When a file approaches the soft limit: split it. When it hits the hard limit: split it now, before
adding more code. The health-check script warns at soft, fails at hard.

**How to split:** Extract by responsibility, not by size. A 300-line file with one clear job is fine.
A 200-line file doing three unrelated things needs splitting even if it's under the limit.

## Function size limits

| Type                      | Soft limit | Hard limit |
| ------------------------- | ---------- | ---------- |
| Regular function          | 60 LOC     | 80 LOC     |
| Complex handler / reducer | 100 LOC    | 150 LOC    |

Functions over the soft limit are a smell. Functions over the hard limit are a bug in the architecture.

## Complexity

- **Cyclomatic complexity ≤ 15** per function (enforced by ESLint or equivalent)
- **Nesting depth ≤ 4** (enforced by linter)
- **Parameters per function ≤ 5** — if you need more, use an options object

## Total LOC budget

Each variant sets its own budget in `scripts/health-check.sh`. The base default is:

- **5,000 LOC** for a lean project
- **15,000 LOC** for a full project

When you approach the budget, the health check warns. This is intentional — large codebases are
harder for LLMs to navigate. If you genuinely need more, raise the budget consciously, not by
ignoring the warning.

## Dead code

Dead code accumulates faster in AI-assisted projects because agents generate code in bursts
and don't always clean up what they replaced.

- Run `make deadcode` to detect unused exports, files, and dependencies (via knip)
- Check `CHANGES.md` — any `symbols_removed` entry that's more than 2 sessions old and
  still appears in grep results is confirmed dead code
- Dead code is not a style issue — it's a navigation tax on every future session

## What the health check does NOT enforce

- Naming conventions (handled by linter)
- Import order (handled by formatter)
- Type coverage (handled by TypeScript strict mode)

These belong in linter/formatter config, not in the health script.
