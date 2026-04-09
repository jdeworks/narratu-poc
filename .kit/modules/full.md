# Mode: full

All three test tiers are active. All hooks enforced. Use for features being merged to main.

## What's active

**Tests:**
- Tier 1: Feature tests — required for all exported symbols
- Tier 2: Architecture tests — file size, complexity, dead code, LOC budget
- Tier 3: LLM integration tests — if project makes LLM calls (see `.kit/llm-testing.md`)

**Hooks:**
- PostToolUse: health warning + auto-format after every file edit
- PreCompact: changelog analysis + SESSION_SUMMARY.md written before compression
- Stop: prompt to write CHANGES.md entry
- SessionStart: last session summary injected into context

**Changelog:**
- CHANGES.md entry required at session end
- symbols_removed must be logged whenever code is deleted
- health_snapshot required in every entry

**Quality gate:**
- `make check` must pass before declaring work complete
- All stages: format → lint → types → deadcode → tests → health

## Cost vs lean mode

Full mode uses more tokens per session because:
- Hooks inject session history at start (~500-2000 tokens depending on history length)
- Architecture test output appears in context after `make health`
- The agent reads more docs (llm-testing.md, changelog-protocol.md) per session

This is intentional. The token overhead pays for itself in fewer regressions and less
time spent re-deriving context in future sessions.

## Switching to lean mid-session

State "switching to lean mode" and read `.kit/modules/lean.md`.
Lean mode is appropriate for: exploring a new approach, writing a spike, quick fixes
where you're certain the change is correct and small.

Switch back to full before merging.
