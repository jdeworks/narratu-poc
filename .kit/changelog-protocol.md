# Changelog protocol

CHANGES.md is a machine-readable session log with **start/end tracking**. Every session
creates a "started" entry at the beginning and a "completed" entry at the end. If a session
is interrupted, the orphaned "started" entry tells the next session what was in progress.

---

## Session lifecycle

```
Session begins
  → Write "started" entry with intent
  → Do work chunk 1
  → Append "- progress:" line
  → Do work chunk 2
  → Append "- progress:" line
  → ...repeat for each logical unit of work...
  → Write "completed" entry with results
Session ends
```

Progress lines accumulate under the session header as work happens. If the session crashes
or is interrupted, the next session sees the orphaned "started" entry AND the progress
lines — so it knows exactly what was done before the interruption.

**Why progress lines matter:** In long sessions, the "completed" entry is often vague or
missing entirely. Progress lines capture work incrementally so nothing is lost. They also
feed dead code detection — removed symbols noted in progress lines are checked by
`analyze-changes.sh`.

---

## When to write entries

**Always write a started entry when:**

- You begin any work session (the session-start hook will prompt you)

**Always write a progress line when:**

- You finish a logical unit of work (bug fix, feature, refactor step) — before moving on
- You remove, rename, or restructure any symbols — note the removed names
- You've been working for a while and haven't logged anything yet
- You're about to switch to a different area of the codebase

**After each progress line, commit.** The rhythm is: finish chunk → log progress → commit.
Small, frequent commits create restore points. If something goes wrong later in the session,
you can roll back to the last good state instead of losing everything.

**Keep the working tree clean.** Every file should be either committed or gitignored. If you
create a local-only file (scratch notes, personal TODO, debug config), add it to `.gitignore`
immediately. Untracked files silently accumulate across sessions and cause confusion. At
session end, `git status` should show a clean working tree.

**Always write a completed entry when:**

- A session ends in full mode (the stop hook will auto-draft one)
- You removed, renamed, or restructured symbols (any mode)
- You refactored something touching more than 3 files

**You may skip the completed entry when:**

- Session is lean mode and you only added new code (no removals)
- You only changed comments, formatting, or config values

---

## Format

**Start entry:**

```
## [YYYY-MM-DDTHH:MM] session-<id> | status: started | mode: full|lean | type: add|fix|refactor|chore
intent: One line describing what this session will do
```

**Progress lines** (appended under the session header as work happens):

```
- progress: <what was done> | <files touched>
- progress: Replaced OldThing with NewThing | src/foo.ts (removed: OldThing)
- progress: Added input validation | src/api/handler.ts, src/api/validate.ts
```

Keep each line short — one sentence + file list. If you removed or renamed symbols, note
them in parentheses so `analyze-changes.sh` can detect dead code. Progress lines are not
a substitute for the completed entry — they're incremental breadcrumbs.

**Completed entry:**

```
## [YYYY-MM-DDTHH:MM] session-<id> | status: completed | mode: full|lean | type: add|fix|refactor|chore
files_touched: path/to/file.ts, path/to/other.ts
symbols_added: ExportedFunctionName, ExportedClassName
symbols_removed: OldFunctionName, RemovedType
tests_added: path/to/new.test.ts
reason: One sentence. Include whether removed symbols were cleaned up or left for later.
health_snapshot: LOC=4234, tests=312, complexity=ok|warn|fail
```

**Session ID:** Use 4 alphanumeric characters (e.g. `a1b2`). Same ID for both start and end.

**Status values:**

- `started` — session is in progress
- `completed` — session finished normally
- `abandoned` — session was interrupted and won't be completed (write this to close an orphan)

---

## Fields

**`intent`** (started entry) — One line describing the goal. This is what the next session
sees if you get interrupted.

**`files_touched`** — Comma-separated list of files modified this session.

**`symbols_added`** / **`symbols_removed`** — Exported functions, classes, types, constants.
`symbols_removed` is mandatory whenever code is deleted — this is how dead code is tracked.

**`tests_added`** — New test files or test cases. Required for `type: fix` entries — every
fix must have a regression test.

**`reason`** — One sentence summary. Keep it brief; detail belongs in commit messages.

**`health_snapshot`** — Quick health metrics: total LOC, total tests, complexity status.

---

## Types

- `add` — new features, new files, new exports
- `fix` — bug fix (requires `tests_added`)
- `refactor` — restructured without changing behaviour
- `chore` — deps, config, CI, tooling

---

## What counts as a symbol

A symbol is anything exported and importable from another file:

- Functions: `export function doThing()`
- Classes: `export class MyService`
- Types/interfaces: `export type Foo`, `export interface Bar`
- Constants: `export const MAX_RETRIES`
- Default exports: `export default MyComponent`

Internal (non-exported) functions don't need tracking.

---

## Example: normal session with progress

```
## [2026-03-28T14:30] session-a1b2 | status: started | mode: full | type: refactor
intent: Replace OldAuthHandler with LoginForm + SessionStore pattern

- progress: Extracted LoginForm from OldAuthHandler | src/auth/login.ts (removed: OldAuthHandler)
- progress: Added SessionStore for token management | src/auth/session.ts (removed: legacyLogin)
- progress: Updated types, removed AuthContext | src/auth/types.ts (removed: AuthContext)
- progress: Added regression tests | src/auth/login.test.ts, src/auth/session.test.ts

## [2026-03-28T15:45] session-a1b2 | status: completed | mode: full | type: refactor
files_touched: src/auth/login.ts, src/auth/types.ts, src/auth/session.ts
symbols_added: LoginForm, validateToken, SessionStore
symbols_removed: OldAuthHandler, legacyLogin, AuthContext
tests_added: src/auth/login.test.ts, src/auth/session.test.ts
reason: Replaced OldAuthHandler with LoginForm + SessionStore. All removed symbols confirmed unused.
health_snapshot: LOC=4102, tests=287, complexity=ok
```

## Example: interrupted session (next session picks up)

```
## [2026-03-28T14:30] session-c3d4 | status: started | mode: full | type: fix
intent: Fix webhook handler processing duplicate Stripe events

## [2026-03-28T16:00] session-e5f6 | status: started | mode: full | type: fix
intent: Completing abandoned session-c3d4 — webhook duplicate fix

## [2026-03-28T16:30] session-c3d4 | status: abandoned | mode: full | type: fix
reason: Session interrupted. Continued in session-e5f6.

## [2026-03-28T17:00] session-e5f6 | status: completed | mode: full | type: fix
files_touched: src/billing/webhook.ts
symbols_added: (none)
symbols_removed: (none)
tests_added: src/billing/webhook.test.ts
reason: Added idempotency check on event ID. Regression test confirms duplicates skipped.
health_snapshot: LOC=4110, tests=289, complexity=ok
```

---

## How hooks use this file

- **session-start.sh** — Rotates old entries, detects orphaned sessions, stale staged changes, dead code
- **progress-reminder.sh** — Every ~5 user messages, checks for recent progress logging and reminds if needed
- **stop.sh** — Auto-drafts a completed entry from git diff + progress lines; blocks if nothing written
- **pre-compact.sh** — Runs `scripts/analyze-changes.sh` to detect dead code from `symbols_removed` and progress lines
- **pre-commit-changes.sh** — Warns if committing without progress lines logged
- **verify-changes.sh** — Validates that test files referenced in `tests_added` actually exist

---

## Keeping it honest

The value degrades fast with vague entries. These are bad:

- `reason: refactored some stuff` — useless
- `symbols_removed: (none)` when you deleted 3 functions — dishonest
- Missing `tests_added` on a fix entry — violates the regression test rule

When in doubt: log too much. Future sessions will thank you.

---

## Rotation

CHANGES.md is automatically trimmed at session start. After 5 completed sessions, older
completed entries are removed — keeping only the 5 most recent plus any open or abandoned
sessions. Git history preserves all removed entries (`git log -p -- CHANGES.md`).

This prevents the file from growing unbounded and bloating context injection. The rotation
is performed by `scripts/rotate-changes.sh`, invoked from `session-start.sh`. You can test
it with `bash scripts/rotate-changes.sh --dry-run`.
