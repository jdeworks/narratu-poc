#!/usr/bin/env bash
# rotate-changes.sh — trims old completed sessions from CHANGES.md
# Keeps the N most recent completed sessions + all open/abandoned sessions.
# Git history preserves everything, so trimmed entries are recoverable.
# Called by: session-start.sh at the start of each session.
# Usage: bash scripts/rotate-changes.sh [--dry-run]
set -euo pipefail

CHANGES_FILE="${CHANGES_FILE:-CHANGES.md}"
KEEP_COMPLETED="${KEEP_COMPLETED:-5}"
DRY_RUN=false
[ "${1:-}" = "--dry-run" ] && DRY_RUN=true

[ ! -f "$CHANGES_FILE" ] && exit 0

# ── Split into header and entries ────────────────────────────────────────────
marker_line=$(grep -n '<!-- Entries below' "$CHANGES_FILE" | head -1 | cut -d: -f1)
[ -z "$marker_line" ] && exit 0

header=$(head -n "$marker_line" "$CHANGES_FILE")
entries=$(tail -n +"$((marker_line + 1))" "$CHANGES_FILE")

# Nothing to rotate if no entries
[ -z "$(echo "$entries" | grep -c '^## \[' || true)" ] && exit 0

# ── Parse entries into blocks keyed by session ID ────────────────────────────
# A block starts with "## [" and runs until the next "## [" or EOF.
# We track each block's session ID and status.

# Collect all completed session IDs in order (oldest first, newest last)
completed_sids=()
while IFS= read -r line; do
  sid=$(echo "$line" | sed -n 's/.*session-\([^ |]*\).*/\1/p')
  [ -n "$sid" ] && completed_sids+=("$sid")
done < <(echo "$entries" | grep 'status: completed')

total_completed=${#completed_sids[@]}

# Nothing to trim if within the keep threshold
if [ "$total_completed" -le "$KEEP_COMPLETED" ]; then
  exit 0
fi

# ── Identify sessions to remove ──────────────────────────────────────────────
# Keep the last N completed, remove the rest
remove_count=$((total_completed - KEEP_COMPLETED))
remove_sids=()
for ((i = 0; i < remove_count; i++)); do
  remove_sids+=("${completed_sids[$i]}")
done

# Protect open sessions (started but never completed/abandoned)
open_sids=()
while IFS= read -r line; do
  sid=$(echo "$line" | sed -n 's/.*session-\([^ |]*\).*/\1/p')
  [ -z "$sid" ] && continue
  # Check if this started session has a completed or abandoned entry
  if ! echo "$entries" | grep -q "session-$sid | status: completed" 2>/dev/null && \
     ! echo "$entries" | grep -q "session-$sid | status: abandoned" 2>/dev/null; then
    open_sids+=("$sid")
  fi
done < <(echo "$entries" | grep 'status: started')

# Remove open sessions from the removal list
filtered_remove_sids=()
for sid in "${remove_sids[@]}"; do
  is_open=false
  for open_sid in "${open_sids[@]}"; do
    [ "$sid" = "$open_sid" ] && is_open=true && break
  done
  [ "$is_open" = false ] && filtered_remove_sids+=("$sid")
done

# Nothing to remove after filtering
[ ${#filtered_remove_sids[@]} -eq 0 ] && exit 0

# ── Dry run: report and exit ─────────────────────────────────────────────────
if [ "$DRY_RUN" = true ]; then
  echo "Would rotate ${#filtered_remove_sids[@]} completed session(s) from CHANGES.md:"
  for sid in "${filtered_remove_sids[@]}"; do
    intent=$(echo "$entries" | grep -A1 "session-$sid | status: started" | tail -1 | sed 's/^intent: //')
    echo "  - session-$sid: $intent"
  done
  echo "Keeping $KEEP_COMPLETED most recent completed session(s). Git history preserves removed entries."
  exit 0
fi

# ── Filter out removed sessions ──────────────────────────────────────────────
# Use awk to process the entries: skip blocks whose session ID is in the removal set.
remove_pattern=""
for sid in "${filtered_remove_sids[@]}"; do
  [ -n "$remove_pattern" ] && remove_pattern+="|"
  remove_pattern+="$sid"
done

filtered_entries=$(echo "$entries" | awk -v pattern="$remove_pattern" '
  BEGIN { skip = 0 }
  /^## \[/ {
    skip = 0
    if (match($0, "session-(" pattern ")")) {
      skip = 1
    }
  }
  !skip { print }
')

# ── Reassemble and write ────────────────────────────────────────────────────
{
  echo "$header"
  echo "$filtered_entries"
} > "$CHANGES_FILE"

echo "Rotated ${#filtered_remove_sids[@]} old session(s) from CHANGES.md (kept $KEEP_COMPLETED most recent)."
