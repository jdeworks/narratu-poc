# Context management

LLM context windows are finite. When a session runs long, the agent starts losing early context —
which means it forgets decisions, repeats work, or contradicts earlier choices. This doc covers
how to manage context deliberately so that doesn't happen.

---

## Signs you need to compress

- The session has been running for more than ~2 hours of work
- You're about to start a significantly different task within the same session
- The agent starts asking about things it already knows ("what's the database we're using?")
- You're approaching the token limit and Claude Code warns you

---

## Before compressing: the pre-compact checklist

The PreCompact hook runs this automatically, but you can trigger it manually:

1. **Write the CHANGES.md entry** for everything done this session (see `.kit/changelog-protocol.md`)
2. **Note any open questions or decisions** that the next context window needs to know
3. **Run `make health`** and note the result in the CHANGES.md health_snapshot
4. **Write next steps** — what should the agent do first when it picks up again?

The PreCompact hook writes SESSION_SUMMARY.md based on CHANGES.md and the current health state.
The SessionStart hook injects this into the next context automatically.

---

## What SESSION_SUMMARY.md contains

After a PreCompact run, SESSION_SUMMARY.md will have:

- **Current state** — what the project does, current tech stack, recent health snapshot
- **Recent changes** — compressed summary of last 5 sessions from CHANGES.md
- **Pending dead code** — symbols removed but not yet cleaned up, with file locations
- **Next steps** — what the agent noted at end of last session

This is designed to be read in full at session start. Keep it under 100 lines.

---

## Manual context compression (without the hook)

If you need to compress mid-session without triggering the hook:

1. Ask the agent: *"Summarise what we've done this session, what decisions we've made,
   what's currently broken, and what we're doing next. Write this to SESSION_SUMMARY.md."*
2. Start a new session — SESSION_SUMMARY.md will be picked up by the SessionStart hook

---

## Long-running feature strategy

For features that will take many sessions:

1. Write a spec before starting (see `.kit/research-planning.md`)
2. The spec lives in `.kit/features/<feature-name>.md` — not in context
3. At the start of each session, tell the agent: *"Read .kit/features/<feature-name>.md
   and SESSION_SUMMARY.md before we continue."*
4. The agent doesn't need to re-derive the full context — it just needs the delta

---

## Task boundary discipline

Context degrades over time. Prefer many small, verified sessions over one long session.

### Never start a new task with a broken current task

If the current task hasn't passed `make verify` (or `make check`), do not start a new one.
Fix what's broken first. Starting new work on top of broken work compounds the problem.

### Compress at task boundaries

If context is getting long (~50% through or the agent starts forgetting earlier decisions):
1. Finish the current task
2. Run `make verify` — everything must pass
3. Commit all passing work
4. Log completed entry in CHANGES.md
5. Then start a new session

The next session starts with a clean, verified codebase and clear SESSION_SUMMARY.md.

### Each session leaves the project working

Every session should end with:
- All tests passing
- No console errors
- Work committed
- CHANGES.md updated

If a session ends with broken state, the next session wastes time re-establishing context
and debugging issues from the previous session. This is the most common source of
quality degradation in multi-session work.

---

## What not to put in AGENTS.md

AGENTS.md loads into every session. If it's too long, the agent's instruction adherence drops.

**Don't put in AGENTS.md:**
- Feature-specific instructions ("when working on the auth system, remember that...")
- Temporary notes or reminders
- Code snippets or examples
- Anything that only applies to one kind of task

Put those in `.kit/` or `.kit/features/` and reference them from AGENTS.md's doc table.
