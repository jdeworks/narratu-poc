# AGENTS.md

## Session mode

Declare your mode at the start of every session:

- **full** — all three test tiers active, all hooks enforced, CHANGES.md required. Use for features being merged.
- **lean** — feature tests only, reduced hooks, CHANGES.md optional. Use for spikes and prototypes.

Default: **full**. To switch, state "mode: lean" at session start or read `.kit/modules/lean.md`.

---

## Project overview

Narratu ("you narrate" in Latin) is an AI-powered audiobook creator that runs entirely in the browser. Users paste a short story, an LLM extracts characters and speech directions, then TTS generates voiced audio with distinct character voices and narration. This is a PoC / investor demo deployed to GitHub Pages.

## Tech stack

- **Framework:** React 19 + TypeScript + Vite
- **Styling:** Tailwind CSS 4
- **State:** Zustand + localForage (IndexedDB)
- **LLM:** BYOK (any provider — Anthropic, OpenAI, etc.)
- **TTS (dev):** Chrome Web Speech API (free)
- **TTS (prod):** BYOK — Hume AI, Cartesia, or ElevenLabs preferred
- **Audio:** Web Audio API for mixing/playback, MP3 export
- **Hosting:** GitHub Pages (static, from `docs/` on `dev` branch)

## Key commands

```
make dev        # start dev server
make check      # full quality pipeline (format + lint + types + deadcode + tests + health)
make test       # run tests only
make health     # architecture health check only
make ci         # check + build (runs in CI)
make help       # list all targets
npm run tunnel  # dev server accessible via cloudflare tunnel
```

## Important paths

- `src/` — React components, engine, providers, stores
- `tests/` — Vitest tests
- `docs/` — built output (served by GitHub Pages)
- `public/` — static assets (images, fonts, favicon)

## Core user flow

1. **Input** — paste/type story (max ~5k tokens)
2. **LLM Analysis** — extract characters, speech directions, inflection markers
3. **Editor** — row-based view: original text, voice-optimized text, annotations. Rows are collapsible, voice-optimized text is inline editable
4. **Voice Profiles** — auto-extract character traits → suggest voice parameters
5. **Voice Sampling** — generate 2-3 TTS samples per character, user picks
6. **Customization** — edit voice text, swap voices, adjust inflection
7. **Generation** — produce voice tracks per section
8. **Playback / Export** — play inline, download as MP3

## Architecture constraints

- **100% client-side** — no backend, everything runs in browser
- **Keys per session** — API keys entered each session, not persisted (security)
- **Max story size** — ~5k tokens (short stories for PoC)
- **Dev phase** — Chrome Web Speech API for TTS, local Claude for LLM testing

---

<!-- kit:managed:start — do not edit this section, it is updated by cli/update.sh -->

## Reference docs — read on demand

Read these when the situation calls for it. Do not load all of them upfront.

| Doc                          | Read when                                                                |
| ---------------------------- | ------------------------------------------------------------------------ |
| `.kit/code-health.md`        | Starting a new feature, adding files, or a file is getting large/complex |
| `.kit/testing.md`            | Writing or reviewing tests; starting a new feature                       |
| `.kit/llm-testing.md`        | Adding or modifying any code that calls an LLM                           |
| `.kit/changelog-protocol.md` | End of session, before compressing context, or after removing symbols    |
| `.kit/context-management.md` | Context is filling up or you're about to compact                         |
| `.kit/research-planning.md`  | Starting a non-trivial feature; unsure about architecture                |
| `.kit/modules/full.md`       | Switching to full mode mid-session                                       |
| `.kit/modules/lean.md`       | Switching to lean mode mid-session                                       |
| `.kit/git-and-github.md`     | Commit hygiene, branching, pre-commit hooks, PR best practices           |

---

## Non-negotiable rules (active in all modes)

1. **No feature is done without tests.** At minimum: one passing test per exported function.
2. **Run `make check` before declaring work complete.** Fix all failures before stopping.
3. **CHANGES.md — track progress as you go, not just at start/end.**

   **a) START:** Before writing any code, append a started entry:

   ```
   ## [YYYY-MM-DDTHH:MM] session-<id> | status: started | mode: full|lean | type: add|fix|refactor|chore
   intent: One line describing what this session will do
   ```

   **b) PROGRESS:** After completing each logical unit of work (a bug fix, a feature, a refactor
   step), append a progress line under the current session **before moving to the next task**:

   ```
   - progress: <what was done> | <files touched>
   ```

   This is lightweight — one line per chunk, not a full entry. If you removed or renamed symbols,
   note them: `- progress: Replaced OldThing with NewThing | src/foo.ts (removed: OldThing)`.
   **Do not batch progress lines at the end.** Log each chunk as you finish it.

   **c) END:** When work is complete, append a completed entry:

   ```
   ## [YYYY-MM-DDTHH:MM] session-<id> | status: completed | mode: full|lean | type: add|fix|refactor|chore
   files_touched: <files you changed>
   symbols_added: <new exports, or (none)>
   symbols_removed: <deleted exports, or (none)>
   tests_added: <test files, or (none)>
   reason: One sentence summary
   health_snapshot: LOC=<n>, tests=<n>, complexity=ok|warn|fail
   ```

   **Mandatory fields:** `symbols_removed` when you delete code. `tests_added` for `type: fix`.
   **Never edit past entries.** Append only. See `.kit/changelog-protocol.md` for details.

4. **Commit early and often.** Make small, meaningful commits after each completed chunk of work.
   - One logical change per commit (a fix, a feature, a refactor step — not "did a bunch of stuff")
   - Commit **after** logging a progress line, not at session end in one giant commit
   - This creates restore points — if something goes wrong, you can roll back to the last good state
   - If you've been working for a while without committing, stop and commit what you have now
   - **Keep the working tree clean.** Every file should be either committed or gitignored — no
     long-lived untracked files. If you create a local-only file (scratch notes, TODO list,
     debug config), add it to `.gitignore` before moving on. At session end, `git status`
     should show a clean tree. Untracked files that silently accumulate across sessions are
     a source of confusion and accidental staging.

5. **Never leave `console.log` in production files.** Use a logger or remove before committing.
6. **Read the relevant doc before starting unfamiliar work** — don't guess at conventions.
7. **Every fix gets a regression test.** When you fix a bug, add a test that would have caught it. Log it in CHANGES.md with `tests_added`.
8. **Check project health at session start.** Before starting new work:
   - **Stale staged changes** — run `git diff --cached`. Staged files persist silently across
     sessions (`git checkout` won't touch them). If an abandoned session left staged deletions
     or modifications, review them first — commit what's good, `git reset HEAD` what's not.
   - **Abandoned sessions** — started but never completed. Complete them or mark as abandoned.
   - **Dead code** — symbols noted as `(removed: ...)` in progress lines or `symbols_removed` that
     still appear in source. Clean them up before starting new work.
   - **Fix hotspots** — areas with repeated fixes need better test coverage.
     See `.kit/testing.md` § Regression tests.

---

## Hooks (Claude Code — supplementary)

Hooks run automatically via `.claude/settings.json` but are **helpers, not the enforcement**.
The rules above apply to all agents whether hooks exist or not.

- After every file edit: health check warning + auto-format
- Before context compact: changelog analysis + session summary written
- On session start: session summary + abandoned session detection
- Periodic progress reminder: every ~5 user messages, checks for recent progress logging
- On stop: auto-drafts completed entry from git diff + progress lines
- Pre-commit: warns if no progress lines logged for the current session

---

<!-- kit:managed:end -->

## Website-specific rules

1. **Mobile-first.** Design for small screens first, enhance for larger ones. Test at 320px minimum.
2. **Semantic HTML.** Use proper heading hierarchy, landmarks, and elements. Accessibility is not optional.
3. **No inline secrets.** API keys entered per session only, never stored in code or localStorage.
4. **Test after changes.** Run tests after every significant change.
5. **Assets in `public/`.** Static assets (images, fonts, favicon) go in `public/`, not `src/`.

## LOC budget override

```
SOFT_FILE_LOC=200
HARD_FILE_LOC=300
LOC_BUDGET=10000
```
