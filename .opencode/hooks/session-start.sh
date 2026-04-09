#!/usr/bin/env bash
# .opencode/hooks/session-start.sh
# Mirrors Claude Code's session-start behavior for OpenCode sessions.
# Detects abandoned sessions, dead code signals, fix hotspots, and injects context.
set -uo pipefail

# ── Session summary from previous session ────────────────────────────────────
if [ -f "SESSION_SUMMARY.md" ]; then
  summary_lines=$(wc -l < SESSION_SUMMARY.md | tr -d ' ')
  if [ "$summary_lines" -gt 10 ]; then
    echo "=== Session context from previous session ==="
    cat SESSION_SUMMARY.md
    echo "============================================="
  fi
fi

if [ ! -f "CHANGES.md" ]; then
  exit 0
fi

# ── Rotate old completed sessions before reading ─────────────────────────────
if [ -f "scripts/rotate-changes.sh" ]; then
  rotation_output=$(bash scripts/rotate-changes.sh 2>&1 || true)
  [ -n "$rotation_output" ] && echo "$rotation_output"
fi

# Only look at real entries (after the marker), not template examples
entries_section=$(sed -n '/<!-- Entries below/,$p' CHANGES.md 2>/dev/null || echo "")

# ── Stale staged changes detection ───────────────────────────────────────────
staged_count=$(git diff --cached --name-only 2>/dev/null | wc -l | tr -d '[:space:]')
if [ "$staged_count" -gt 0 ]; then
  staged_deletions=$(git diff --cached --name-status 2>/dev/null | grep -c '^D' || true)
  staged_deletions=$((staged_deletions + 0))
  echo "=== WARNING: $staged_count stale staged change(s) detected ==="
  [ "$staged_deletions" -gt 0 ] && echo "  Including $staged_deletions DELETION(S) — review carefully!"
  git diff --cached --name-status 2>/dev/null | head -15
  [ "$staged_count" -gt 15 ] && echo "  ... and $((staged_count - 15)) more"
  echo "Staged files persist silently across sessions — git checkout won't touch them."
  echo "Run 'git diff --cached' to inspect. Then commit or 'git reset HEAD' to unstage."
  echo "============================================================"
fi

# ── Untracked files check ────────────────────────────────────────────────────
untracked_count=$(git ls-files --others --exclude-standard 2>/dev/null | wc -l | tr -d '[:space:]')
if [ "$untracked_count" -gt 0 ]; then
  echo "=== Untracked files ($untracked_count) ==="
  git ls-files --others --exclude-standard 2>/dev/null | head -10
  [ "$untracked_count" -gt 10 ] && echo "  ... and $((untracked_count - 10)) more"
  echo "Each should be either committed or added to .gitignore."
  echo "==========================="
fi

# ── Detect abandoned sessions ────────────────────────────────────────────────
abandoned=""
if [ -n "$entries_section" ]; then
  while IFS= read -r line; do
    sid=$(echo "$line" | sed -n 's/.*session-\([^ |]*\).*/\1/p')
    [ -z "$sid" ] && continue
    if ! echo "$entries_section" | grep -q "session-$sid | status: completed" 2>/dev/null; then
      intent=$(echo "$entries_section" | grep -A1 "session-$sid | status: started" | tail -1 | sed 's/^intent: //')
      # Show progress lines if any
      progress=$(echo "$entries_section" | sed -n "/session-$sid | status: started/,/^## \[/p" | grep '^- progress:' | head -5)
      abandoned+="  - session-$sid: $intent\n"
      [ -n "$progress" ] && abandoned+="    Progress logged:\n$(echo "$progress" | sed 's/^/    /')\n"
    fi
  done < <(echo "$entries_section" | grep 'status: started' 2>/dev/null)
fi

if [ -n "$abandoned" ]; then
  echo "=== Abandoned sessions (started but never completed) ==="
  printf "%b" "$abandoned"
  echo "Review these — complete or mark as abandoned before starting new work."
  echo "=========================================================="
fi

# ── Dead code check from progress lines + symbols_removed ────────────────────
if [ -f "scripts/analyze-changes.sh" ]; then
  dead_output=$(SRC_DIR="${SRC_DIR:-src}" bash scripts/analyze-changes.sh 2>&1 | grep 'DEAD:' || true)
  if [ -n "$dead_output" ]; then
    echo "=== Dead code detected ==="
    echo "$dead_output"
    echo "Clean these up before starting new work."
    echo "==========================="
  fi
fi

# ── Recent entries + fix hotspots ────────────────────────────────────────────
recent=$(echo "$entries_section" | grep -A7 '^## \[' | tail -30 2>/dev/null || echo "")
if [ -n "$recent" ]; then
  echo "=== Recent CHANGES.md entries ==="
  echo "$recent"
  echo "================================="
fi

fix_areas=$(echo "$entries_section" | grep -B1 'type: fix' 2>/dev/null \
  | grep '^files_touched:' \
  | sed 's/files_touched: //' \
  | tr ',' '\n' \
  | sed 's/^[[:space:]]*//' \
  | cut -d/ -f1-2 \
  | sort | uniq -c | sort -rn \
  | head -3 \
  | awk '$1 >= 2 {print "  " $1 "x fixes in " $2}' 2>/dev/null || echo "")

if [ -n "$fix_areas" ]; then
  echo "=== Fix hotspots ==="
  echo "$fix_areas"
  echo "Consider preventive tests in these areas."
  echo "===================="
fi

echo ""
echo "=== Required action ==="
echo "Write a CHANGES.md **started** entry now with your session intent."
echo "Format: ## [$(date +%Y-%m-%dT%H:%M)] session-<4chars> | status: started | mode: full | type: add|fix|refactor|chore"
echo "intent: <what you plan to do>"
echo "========================"

exit 0
