#!/usr/bin/env bash
# session-start.sh — runs at the start of every Claude Code session
# Injects session context: mode, abandoned sessions, recent history
# Triggered by: SessionStart
set -uo pipefail

output=""

# ── Self-check: verify hooks exist and kit version ───────────────────────────
warnings=""

# Check all hook scripts referenced in settings.json exist
if [ -f ".claude/settings.json" ]; then
  while IFS= read -r hook_path; do
    if [ ! -f "$hook_path" ]; then
      warnings+="  - Missing hook script: $hook_path\n"
    fi
  done < <(grep -o 'bash [^"]*\.sh' .claude/settings.json | sed 's/^bash //')
fi

# Check kit version and compare against remote
kit_version=""
if [ -f ".claude/KIT_VERSION" ]; then
  kit_version=$(tr -d '[:space:]' < .claude/KIT_VERSION)
else
  warnings+="  - Missing .claude/KIT_VERSION — run update.sh to install\n"
fi

if [ -n "$kit_version" ]; then
  remote_version=$(curl -sfL --max-time 2 \
    "https://raw.githubusercontent.com/jdeworks/project-starter-kit/dev/base/.claude/KIT_VERSION" 2>/dev/null | tr -d '[:space:]' || echo "")
  if [ -n "$remote_version" ] && [ "$remote_version" != "$kit_version" ]; then
    warnings+="  - Kit update available: $kit_version -> $remote_version (run update.sh)\n"
  fi
fi

if [ -n "$warnings" ]; then
  output+="### Starter-kit warnings\n${warnings}\n"
fi

# Inject only actionable parts of SESSION_SUMMARY (not full session history)
has_summary=false
if [ -f "SESSION_SUMMARY.md" ]; then
  summary_lines=$(wc -l < SESSION_SUMMARY.md | tr -d ' ')
  if [ "$summary_lines" -gt 10 ]; then
    has_summary=true
    # Extract just health, dead code, and next steps — skip verbose session history
    health=$(sed -n '/^## Current health/,/^##/p' SESSION_SUMMARY.md | head -n -1)
    dead=$(sed -n '/^## Pending dead code/,/^##/p' SESSION_SUMMARY.md | head -n -1)
    next=$(sed -n '/^## Next steps/,/^##/p' SESSION_SUMMARY.md | head -n -1)
    [ -n "$health" ] && output+="$health\n"
    if [ -n "$dead" ] && ! echo "$dead" | grep -q 'None detected'; then
      output+="$dead\n"
    fi
    if [ -n "$next" ] && ! echo "$next" | grep -q '<!-- Agent:'; then
      output+="$next\n"
    fi
  fi
fi

# Detect session mode from AGENTS.md
mode="full"
if [ -f "AGENTS.md" ] && grep -q 'Default: \*\*lean\*\*' AGENTS.md 2>/dev/null; then
  mode="lean"
fi

# ── Rotate old completed sessions before reading ─────────────────────────────
if [ -f "scripts/rotate-changes.sh" ] && [ -f "CHANGES.md" ]; then
  rotation_output=$(bash scripts/rotate-changes.sh 2>&1 || true)
  if [ -n "$rotation_output" ]; then
    output+="### Changes rotation\n${rotation_output}\n\n"
  fi
fi

# Only look at real entries (after the marker), not template examples
entries_section=""
if [ -f "CHANGES.md" ]; then
  entries_section=$(sed -n '/<!-- Entries below/,$p' CHANGES.md 2>/dev/null || echo "")
fi

# Detect abandoned sessions (started but never completed)
abandoned=""
if [ -n "$entries_section" ]; then
  while IFS= read -r line; do
    sid=$(echo "$line" | sed -n 's/.*session-\([^ |]*\).*/\1/p')
    [ -z "$sid" ] && continue
    if ! echo "$entries_section" | grep -q "session-$sid | status: completed" 2>/dev/null; then
      intent=$(echo "$entries_section" | grep -A1 "session-$sid | status: started" | tail -1 | sed 's/^intent: //')
      abandoned+="  - session-$sid: $intent\n"
      # Show progress lines if any exist
      progress=$(echo "$entries_section" | sed -n "/session-$sid | status: started/,/^## \[/p" | grep '^- progress:' | head -5)
      if [ -n "$progress" ]; then
        abandoned+="    Progress logged before interruption:\n$(echo "$progress" | sed 's/^/    /')\n"
      fi
    fi
  done < <(echo "$entries_section" | grep 'status: started' 2>/dev/null)
fi

# ── Stale staged changes detection ───────────────────────────────────────────
# Staged changes persist silently across sessions — git checkout won't touch them.
# If there's an abandoned session AND staged changes, that's a red flag.
staged_changes=""
staged_count=$(git diff --cached --name-only 2>/dev/null | wc -l | tr -d '[:space:]')
if [ "$staged_count" -gt 0 ]; then
  staged_deletions=$(git diff --cached --name-status 2>/dev/null | grep -c '^D' || true)
  staged_deletions=$((staged_deletions + 0))
  staged_mods=$(git diff --cached --name-status 2>/dev/null | grep -c '^M' || true)
  staged_mods=$((staged_mods + 0))
  staged_summary="$staged_count file(s) staged"
  [ "$staged_deletions" -gt 0 ] && staged_summary+=", $staged_deletions DELETION(S)"
  [ "$staged_mods" -gt 0 ] && staged_summary+=", $staged_mods modification(s)"
  staged_files=$(git diff --cached --name-status 2>/dev/null | head -15)
  staged_changes="$staged_summary\n$staged_files"
  [ "$staged_count" -gt 15 ] && staged_changes+="\n  ... and $((staged_count - 15)) more"
fi

# ── Untracked files check ────────────────────────────────────────────────────
# Every file should be committed or gitignored. Untracked files silently accumulate.
untracked_files=""
untracked_count=$(git ls-files --others --exclude-standard 2>/dev/null | wc -l | tr -d '[:space:]')
if [ "$untracked_count" -gt 0 ]; then
  untracked_list=$(git ls-files --others --exclude-standard 2>/dev/null | head -10)
  untracked_files="$untracked_count untracked file(s):\n$untracked_list"
  [ "$untracked_count" -gt 10 ] && untracked_files+="\n  ... and $((untracked_count - 10)) more"
fi

# ── Dead code check from last session ────────────────────────────────────────
dead_code=""
if [ -f "scripts/analyze-changes.sh" ]; then
  dead_output=$(SRC_DIR="${SRC_DIR:-src}" bash scripts/analyze-changes.sh 2>&1 | grep 'DEAD:' || true)
  if [ -n "$dead_output" ]; then
    dead_code="$dead_output"
  fi
fi

# Inject recent CHANGES.md entries (skip if SESSION_SUMMARY already has them)
recent=""
fix_areas=""
if [ -n "$entries_section" ]; then
  if [ "$has_summary" = false ]; then
    recent=$(echo "$entries_section" | grep -A7 '^## \[' | tail -30 2>/dev/null || echo "")
  fi
  # Check for fix hotspots (always, even if summary covers recent entries)
  fix_areas=$(echo "$entries_section" | grep -B1 'type: fix' 2>/dev/null \
    | grep '^files_touched:' \
    | sed 's/files_touched: //' \
    | tr ',' '\n' \
    | sed 's/^[[:space:]]*//' \
    | cut -d/ -f1-2 \
    | sort | uniq -c | sort -rn \
    | head -3 \
    | awk '$1 >= 2 {print "  " $1 "x fixes in " $2}' 2>/dev/null || echo "")
fi

# Build context message
ctx="### Session info\nMode: **$mode**\n"
if [ -n "$staged_changes" ]; then
  ctx+="\n### WARNING: Stale staged changes detected\n${staged_changes}\n"
  if [ -n "$abandoned" ]; then
    ctx+="These staged changes likely come from an interrupted session. Staged files persist\n"
    ctx+="silently across sessions — git checkout won't touch them. **Review before doing anything else.**\n"
    ctx+="Run \`git diff --cached\` to inspect. Then either commit them or \`git reset HEAD\` to unstage.\n"
  else
    ctx+="Staged files persist across sessions. Run \`git diff --cached\` to review.\n"
  fi
  ctx+="\n"
fi
if [ -n "$abandoned" ]; then
  ctx+="### Abandoned sessions (started but never completed)\n${abandoned}"
  ctx+="Review these — complete or mark as abandoned before starting new work.\n\n"
fi
if [ -n "$recent" ]; then
  ctx+="\n### Recent session history\n${recent}\n"
fi
if [ -n "$fix_areas" ]; then
  ctx+="\n### Fix hotspots\n${fix_areas}\nConsider preventive tests in these areas.\n"
fi
if [ -n "$dead_code" ]; then
  ctx+="\n### Dead code from previous sessions\n${dead_code}\nClean these up before starting new work.\n"
fi
if [ -n "$untracked_files" ]; then
  ctx+="\n### Untracked files\n${untracked_files}\n"
  ctx+="Each should be either committed (if part of the project) or added to .gitignore (if local-only).\n"
fi
ctx+="\n### Required action\n"
ctx+="Write a CHANGES.md **started** entry now with your session intent.\n"
ctx+="Format: ## [$(date +%Y-%m-%dT%H:%M)] session-<4chars> | status: started | mode: $mode | type: add|fix|refactor|chore\n"
ctx+="intent: <what you plan to do>\n"

output+="$ctx"

# Output as additionalContext JSON
if [ -n "$output" ]; then
  escaped=$(printf '%s' "$output" | python3 -c "import sys,json; sys.stdout.write(json.dumps(sys.stdin.read()))" 2>/dev/null || printf '"%s"' "$output")
  printf '{"additionalContext": %s}' "$escaped"
fi

exit 0
