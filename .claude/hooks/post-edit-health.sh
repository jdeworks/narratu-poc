#!/usr/bin/env bash
# post-edit-health.sh — runs after every file write/edit
# Non-blocking: outputs warnings to stderr so Claude sees them but work continues.
# Triggered by: PostToolUse on Edit|Write|MultiEdit
set -uo pipefail

# Read hook input with timeout to prevent hanging
input=$(timeout 2 cat 2>/dev/null || echo "")
[ -z "$input" ] && exit 0

file_path=$(echo "$input" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('tool_input',{}).get('file_path',''))" 2>/dev/null || echo "")

[ -z "$file_path" ] && exit 0
[ ! -f "$file_path" ] && exit 0

# Only check source files, not tests or config
if [[ "$file_path" == *.test.* || "$file_path" == *.spec.* || "$file_path" == *config* ]]; then
  exit 0
fi

loc=$(wc -l < "$file_path" | tr -d ' ')
SOFT_FILE_LOC=${SOFT_FILE_LOC:-250}
HARD_FILE_LOC=${HARD_FILE_LOC:-350}

if [ "$loc" -ge "$HARD_FILE_LOC" ]; then
  echo "Health warning: $file_path is $loc LOC (hard limit $HARD_FILE_LOC). This file should be split before adding more code." >&2
elif [ "$loc" -ge "$SOFT_FILE_LOC" ]; then
  echo "Health note: $file_path is $loc LOC (soft limit $SOFT_FILE_LOC). Consider splitting soon." >&2
fi

if grep -q 'console\.log' "$file_path" 2>/dev/null; then
  echo "Health warning: $file_path contains console.log. Remove or replace with a logger." >&2
fi

exit 0
