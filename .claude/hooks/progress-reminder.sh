#!/usr/bin/env bash
# progress-reminder.sh — periodic reminder to log progress in CHANGES.md
# Fires on UserPromptSubmit but only injects a reminder every ~5 messages.
# Uses a counter file to avoid bloating context on every message.
# Triggered by: UserPromptSubmit
set -uo pipefail

[ ! -f "CHANGES.md" ] && exit 0

COUNTER_FILE=".claude/.progress-counter"
REMINDER_INTERVAL=${REMINDER_INTERVAL:-5}

# Initialize or read counter
count=0
if [ -f "$COUNTER_FILE" ]; then
  count=$(cat "$COUNTER_FILE" 2>/dev/null | tr -d '[:space:]')
  [[ "$count" =~ ^[0-9]+$ ]] || count=0
fi

count=$((count + 1))
echo "$count" > "$COUNTER_FILE"

# Only remind every N messages
if [ $((count % REMINDER_INTERVAL)) -ne 0 ]; then
  exit 0
fi

# Check if there's an active session
entries_section=$(sed -n '/<!-- Entries below/,$p' CHANGES.md 2>/dev/null || echo "")
last_started_sid=$(echo "$entries_section" | grep 'status: started' | tail -1 | sed -n 's/.*session-\([^ |]*\).*/\1/p')

[ -z "$last_started_sid" ] && exit 0

# Already completed? No reminder needed
if echo "$entries_section" | grep -q "session-$last_started_sid | status: completed" 2>/dev/null; then
  exit 0
fi

# Count progress lines for the current session
session_block=$(echo "$entries_section" | sed -n "/session-$last_started_sid | status: started/,/^## \[/p" | head -n -1)
progress_count=$(echo "$session_block" | grep -c '^- progress:' || true)
progress_count=$((progress_count + 0))

# Count uncommitted changed files (rough proxy for "work done since last log")
changed_files=$(git diff --name-only HEAD 2>/dev/null | wc -l | tr -d '[:space:]')
staged_files=$(git diff --name-only --cached HEAD 2>/dev/null | wc -l | tr -d '[:space:]')
total_changes=$((changed_files + staged_files))

# Only remind if there are changes but few/no progress lines relative to work done
if [ "$total_changes" -le 1 ] && [ "$progress_count" -gt 0 ]; then
  exit 0
fi

# Check if verification has been run recently
verify_nudge=""
if [ ! -f ".verify/last-check" ] && (ls playwright.config.* apps/*/playwright.config.* 2>/dev/null | head -1 > /dev/null 2>&1 || [ -f "Makefile" ]); then
  verify_nudge="
Consider running 'make check' (or 'make verify' for UI projects) to catch issues early."
elif [ -f ".verify/last-check" ] && [ "$(find .verify/last-check -mmin +60 2>/dev/null)" ]; then
  verify_nudge="
It's been a while since you ran verification. Consider 'make check' or 'make verify' before continuing."
fi

# Build a concise reminder
MSG="--- Progress tracking reminder ---
Session $last_started_sid has $progress_count progress line(s) logged and ~$total_changes file(s) changed.
If you've completed a logical unit of work, append a progress line to CHANGES.md now:
  - progress: <what was done> | <files>
This keeps the session log accurate even if the session is interrupted.$verify_nudge
---"

escaped=$(printf '%s' "$MSG" | python3 -c "import sys,json; sys.stdout.write(json.dumps(sys.stdin.read()))" 2>/dev/null || printf '"%s"' "$MSG")
printf '{"additionalContext": %s}\n' "$escaped"

exit 0
