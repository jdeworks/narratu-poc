#!/usr/bin/env bash
# .opencode/hooks/session-end.sh
# Mirrors Claude Code's stop.sh — auto-drafts completed entry from git + progress lines.
set -uo pipefail

[ ! -f "CHANGES.md" ] && exit 0

# Detect mode
mode="full"
if [ -f "AGENTS.md" ] && grep -q 'Default: \*\*lean\*\*' AGENTS.md 2>/dev/null; then
  mode="lean"
fi

# Only check entries after the marker
entries_section=$(sed -n '/<!-- Entries below/,$p' CHANGES.md 2>/dev/null || echo "")
last_started_sid=$(echo "$entries_section" | grep 'status: started' | tail -1 | sed -n 's/.*session-\([^ |]*\).*/\1/p')

if [ -n "$last_started_sid" ]; then
  if echo "$entries_section" | grep -q "session-$last_started_sid | status: completed" 2>/dev/null; then
    echo "==> Session $last_started_sid already completed. All good."
    exit 0
  fi
fi

# Run changelog analysis
echo "==> Session end: running changelog analysis..."
if [ -f "scripts/analyze-changes.sh" ]; then
  bash scripts/analyze-changes.sh
fi

# ── Gather git changes ──────────────────────────────────────────────────────
changed_files=$(git diff --name-only HEAD 2>/dev/null; git diff --name-only --cached HEAD 2>/dev/null; git ls-files --others --exclude-standard 2>/dev/null)
changed_files=$(echo "$changed_files" | sort -u | grep -v '^$' | grep -v 'CHANGES.md' | grep -v 'SESSION_SUMMARY.md' || echo "")
diff_stat=$(git diff --stat HEAD 2>/dev/null || echo "")

# ── Gather progress lines ───────────────────────────────────────────────────
progress_lines=""
if [ -n "$last_started_sid" ]; then
  session_block=$(echo "$entries_section" | sed -n "/session-$last_started_sid | status: started/,/^## \[/p" | head -n -1)
  progress_lines=$(echo "$session_block" | grep '^- progress:' 2>/dev/null || echo "")
fi

# ── Extract removed symbols from progress lines ─────────────────────────────
removed_from_progress=""
if [ -n "$progress_lines" ]; then
  removed_from_progress=$(echo "$progress_lines" | grep -oP '\(removed?: \K[^)]+' 2>/dev/null | tr ',' '\n' | sed 's/^[[:space:]]*//' | sort -u | paste -sd', ' || echo "")
fi

# ── Detect session type ─────────────────────────────────────────────────────
session_type=$(echo "$entries_section" | grep "session-${last_started_sid:-xxxx} | status: started" | sed -n 's/.*type: \([a-z]*\).*/\1/p')
[ -z "$session_type" ] && session_type="add"

# ── Build draft ──────────────────────────────────────────────────────────────
files_list=$(echo "$changed_files" | head -20 | tr '\n' ', ' | sed 's/,$//')
[ -z "$files_list" ] && files_list="(none detected — check git status)"

echo ""
echo "=== CHANGES.md: session not completed ==="
echo "Session $last_started_sid has no completed entry."

if [ -n "$progress_lines" ]; then
  echo ""
  echo "Progress logged so far:"
  echo "$progress_lines"
fi

echo ""
echo "Draft completed entry (review and fill in blanks):"
echo ""
echo "## [$(date +%Y-%m-%dT%H:%M)] session-${last_started_sid:-xxxx} | status: completed | mode: $mode | type: $session_type"
echo "files_touched: $files_list"
echo "symbols_added: (fill in)"
echo "symbols_removed: ${removed_from_progress:-(fill in)}"
echo "tests_added: (fill in)"
echo "reason: (fill in — summarize from progress lines above)"
echo "health_snapshot: LOC=?, tests=?, complexity=?"

if [ -n "$diff_stat" ]; then
  echo ""
  echo "Git diff summary:"
  echo "$diff_stat"
fi

echo "=========================================="

exit 0
