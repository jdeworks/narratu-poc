#!/usr/bin/env bash
# post-edit-format.sh — auto-format after every file write/edit
# Triggered by: PostToolUse on Edit|Write|MultiEdit
set -uo pipefail

# Read hook input with timeout to prevent hanging
input=$(timeout 2 cat 2>/dev/null || echo "")
[ -z "$input" ] && exit 0

file_path=$(echo "$input" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('tool_input',{}).get('file_path',''))" 2>/dev/null || echo "")

[ -z "$file_path" ] && exit 0
[ ! -f "$file_path" ] && exit 0

# Detect formatter and run if available
if command -v prettier &>/dev/null; then
  timeout 5 prettier --write "$file_path" --log-level silent 2>/dev/null || true
elif command -v biome &>/dev/null; then
  timeout 5 biome format --write "$file_path" 2>/dev/null || true
fi

exit 0
