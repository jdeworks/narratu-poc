#!/usr/bin/env bash
# pre-commit-changes.sh — git pre-commit hook that warns if CHANGES.md has no progress
# This is a soft warning (exit 0), not a block — it just outputs to stderr.
# Install: symlink or copy to .git/hooks/pre-commit, or call from an existing pre-commit.
# Triggered by: git commit (via git hooks, not Claude Code hooks)
set -uo pipefail

[ ! -f "CHANGES.md" ] && exit 0

# Only check entries after the marker
entries_section=$(sed -n '/<!-- Entries below/,$p' CHANGES.md 2>/dev/null || echo "")
last_started_sid=$(echo "$entries_section" | grep 'status: started' | tail -1 | sed -n 's/.*session-\([^ |]*\).*/\1/p')

[ -z "$last_started_sid" ] && exit 0

# Already completed? All good
if echo "$entries_section" | grep -q "session-$last_started_sid | status: completed" 2>/dev/null; then
  exit 0
fi

# Count progress lines
session_block=$(echo "$entries_section" | sed -n "/session-$last_started_sid | status: started/,/^## \[/p" | head -n -1)
progress_count=$(echo "$session_block" | grep -c '^- progress:' || true)
progress_count=$((progress_count + 0))

if [ "$progress_count" -eq 0 ]; then
  echo "" >&2
  echo "=== CHANGES.md reminder ===" >&2
  echo "Session $last_started_sid has no progress lines." >&2
  echo "Consider adding: - progress: <what was done> | <files>" >&2
  echo "===========================" >&2
  echo "" >&2
fi

# Warn if staged deletions exceed a threshold (possible accidental cleanup)
deleted_count=$(git diff --cached --name-status 2>/dev/null | grep -c '^D' || true)
deleted_count=$((deleted_count + 0))
if [ "$deleted_count" -gt 5 ]; then
  echo "" >&2
  echo "=== Deletion warning ===" >&2
  echo "$deleted_count files staged for deletion. Verify these are intentional:" >&2
  git diff --cached --name-status 2>/dev/null | grep '^D' | head -10 | sed 's/^/  /' >&2
  [ "$deleted_count" -gt 10 ] && echo "  ... and $((deleted_count - 10)) more" >&2
  echo "========================" >&2
  echo "" >&2
fi

# Warn about untracked files — every file should be committed or gitignored
untracked_count=$(git ls-files --others --exclude-standard 2>/dev/null | wc -l | tr -d '[:space:]')
if [ "$untracked_count" -gt 0 ]; then
  echo "" >&2
  echo "=== Untracked files ===" >&2
  echo "$untracked_count untracked file(s) in working tree. Each should be either:" >&2
  echo "  - Staged and committed (if it's part of the project)" >&2
  echo "  - Added to .gitignore (if it's local-only: scratch notes, debug config, etc.)" >&2
  git ls-files --others --exclude-standard 2>/dev/null | head -10 | sed 's/^/  /' >&2
  [ "$untracked_count" -gt 10 ] && echo "  ... and $((untracked_count - 10)) more" >&2
  echo "========================" >&2
  echo "" >&2
fi

# Always allow the commit — this is advisory only
exit 0
