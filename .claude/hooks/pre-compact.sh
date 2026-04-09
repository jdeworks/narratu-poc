#!/usr/bin/env bash
# pre-compact.sh — runs before Claude Code compresses context
# Analyzes CHANGES.md for dead code, writes SESSION_SUMMARY.md
# Triggered by: PreCompact
set -uo pipefail

# Run the changelog analyzer (output goes to stdout for user visibility)
analysis=""
if [ -f "scripts/analyze-changes.sh" ]; then
  analysis=$(bash scripts/analyze-changes.sh 2>&1) || true
else
  analysis="Warning: scripts/analyze-changes.sh not found — skipping dead code analysis"
fi

# Build reminder for Claude via additionalContext
# Check if verification has been run recently
verify_warning=""
if ls playwright.config.* apps/*/playwright.config.* 2>/dev/null | head -1 > /dev/null 2>&1; then
  if [ ! -f ".verify/last-check" ] || [ "$(find .verify/last-check -mmin +120 2>/dev/null)" ]; then
    verify_warning="
CRITICAL: This project has browser tests. Run 'make verify' NOW before context is lost.
If tests fail, fix them before compressing — the next session won't have context to debug current failures."
  fi
fi

REMINDER="$analysis

--- PreCompact reminder ---
Before this context is compressed, please:
1. Run 'make verify' (or 'make check' for non-UI projects) — commit passing work$verify_warning
2. Ensure your CHANGES.md session has a completed entry (see AGENTS.md rule 3)
3. Fill in the Next steps section of SESSION_SUMMARY.md
4. Note any unresolved questions or in-progress work
---"

escaped=$(printf '%s' "$REMINDER" | python3 -c "import sys,json; sys.stdout.write(json.dumps(sys.stdin.read()))" 2>/dev/null || printf '"%s"' "$REMINDER")
printf '{"additionalContext": %s}\n' "$escaped"

exit 0
