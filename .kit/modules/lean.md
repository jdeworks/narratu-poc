# Mode: lean

Reduced enforcement. Optimised for smaller context windows and faster models.
Use for spikes, prototypes, and early-stage MVPs. Switch to full before merging to main.

## What's active

**Tests:**

- Tier 1: Feature tests — still required (no feature done without tests)
- Tier 2: Architecture tests — advisory only (warnings shown, not blocking)
- Tier 3: LLM tests — mocked only, no real API calls, cost annotations optional

**Hooks:**

- PostToolUse: health warning only (format hook disabled to reduce noise)
- PreCompact: SESSION_SUMMARY.md written (changelog analysis optional)
- Stop: CHANGES.md entry optional (recommended when removing symbols)
- SessionStart: summary injected if SESSION_SUMMARY.md exists

**Changelog:**

- CHANGES.md entry optional, but write one if you remove symbols
- health_snapshot optional

**Quality gate:**

- `make test` must pass (feature tests)
- `make check` is recommended but not blocking

## What lean mode saves

- ~40% fewer tokens per session (fewer doc reads, lighter hook output, shorter AGENTS.md)
- Faster iteration on new ideas
- Less friction when exploring unfamiliar territory

## What lean mode costs

- Architecture drift accumulates — complexity and file size creep up unnoticed
- Dead code is less likely to be caught and logged
- LLM integration tests may be insufficient to catch prompt or response drift

These debts compound. Lean mode is fine for a sprint; it's a problem as a default.

## Upgrading to full mode

When you're ready to enforce the full quality pipeline:

```bash
cli/upgrade.sh
```

This will:

1. Update AGENTS.md mode declaration to `full`
2. Add Tier 2 architecture test files if missing
3. Activate all hooks in `.claude/settings.json`
4. Run `make health` and show what needs fixing
5. Show a checklist of what to address before the first full `make check` passes

The upgrade script doesn't delete or modify your source code. It only adds enforcement tooling.
