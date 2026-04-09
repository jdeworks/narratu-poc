#!/usr/bin/env bash
# stop.sh — runs when Claude Code finishes responding
# Auto-drafts a completed CHANGES.md entry from git diff + progress lines.
# Triggered by: Stop
set -uo pipefail

[ ! -f "CHANGES.md" ] && exit 0

# ── Check if e2e tests should have been run ────────────────────────────────
e2e_warning=""
if ls playwright.config.* apps/*/playwright.config.* 2>/dev/null | head -1 > /dev/null 2>&1; then
  if [ ! -f ".verify/last-check" ] || [ "$(find .verify/last-check -mmin +120 2>/dev/null)" ]; then
    e2e_warning="WARNING: This project has browser tests but make e2e has not been run recently. Run make verify before finishing."
  fi
fi

# Detect mode
mode="full"
if [ -f "AGENTS.md" ] && grep -q 'Default: \*\*lean\*\*' AGENTS.md 2>/dev/null; then
  mode="lean"
fi

# Only check entries after the marker to skip template examples
entries_section=$(sed -n '/<!-- Entries below/,$p' CHANGES.md 2>/dev/null || echo "")

# Find the most recent "started" entry and check if it has a matching "completed"
last_started_sid=$(echo "$entries_section" | grep 'status: started' | tail -1 | sed -n 's/.*session-\([^ |]*\).*/\1/p')

if [ -n "$last_started_sid" ]; then
  if echo "$entries_section" | grep -q "session-$last_started_sid | status: completed" 2>/dev/null; then
    # Session properly completed — all good, reset counter
    rm -f .claude/.progress-counter
    exit 0
  fi
fi

# ── Gather actual changes from git ───────────────────────────────────────────
changed_files=$(git diff --name-only HEAD 2>/dev/null; git diff --name-only --cached HEAD 2>/dev/null; git ls-files --others --exclude-standard 2>/dev/null)
changed_files=$(echo "$changed_files" | sort -u | grep -v '^$' | grep -v 'CHANGES.md' | grep -v 'SESSION_SUMMARY.md' || echo "")
diff_stat=$(git diff --stat HEAD 2>/dev/null || echo "")

# ── Gather existing progress lines ──────────────────────────────────────────
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

# ── Detect session type from started entry ───────────────────────────────────
session_type=$(echo "$entries_section" | grep "session-${last_started_sid:-xxxx} | status: started" | sed -n 's/.*type: \([a-z]*\).*/\1/p')
[ -z "$session_type" ] && session_type="add"

# ── Build draft completed entry ──────────────────────────────────────────────
files_list=$(echo "$changed_files" | head -20 | tr '\n' ', ' | sed 's/,$//')
[ -z "$files_list" ] && files_list="(none detected — check git status)"

draft="## [$(date +%Y-%m-%dT%H:%M)] session-${last_started_sid:-xxxx} | status: completed | mode: $mode | type: $session_type
files_touched: $files_list
symbols_added: (fill in)
symbols_removed: ${removed_from_progress:-(fill in)}
tests_added: (fill in)
reason: (fill in — summarize from progress lines above)
health_snapshot: LOC=?, tests=?, complexity=?"

# No completed entry for the current/last session
if [ "$mode" = "full" ]; then
  MSG="--- CHANGES.md: session not completed ---
You have a started session (${last_started_sid}) without a completed entry.
In full mode, you MUST append a completed entry to CHANGES.md before finishing."

  if [ -n "$e2e_warning" ]; then
    MSG+="

$e2e_warning"
  fi

  if [ -n "$progress_lines" ]; then
    MSG+="

Progress logged so far:
$progress_lines"
  fi

  MSG+="

Draft completed entry (review and fill in blanks):

$draft"

  if [ -n "$diff_stat" ]; then
    MSG+="

Git diff summary:
$diff_stat"
  fi

  MSG+="
---"

  escaped=$(printf '%s' "$MSG" | python3 -c "import sys,json; sys.stdout.write(json.dumps(sys.stdin.read()))" 2>/dev/null || printf '"%s"' "$MSG")
  printf '{"additionalContext": %s}\n' "$escaped"
  exit 1
fi

# Lean mode — gentle reminder with draft
MSG="--- Session end reminder (lean mode) ---
Consider completing session ${last_started_sid:-?} in CHANGES.md if you removed or renamed symbols."

if [ -n "$e2e_warning" ]; then
  MSG+="

$e2e_warning"
fi

if [ -n "$progress_lines" ]; then
  MSG+="

Progress logged:
$progress_lines"
fi

MSG+="
---"

escaped=$(printf '%s' "$MSG" | python3 -c "import sys,json; sys.stdout.write(json.dumps(sys.stdin.read()))" 2>/dev/null || printf '"%s"' "$MSG")
printf '{"additionalContext": %s}\n' "$escaped"

exit 0
