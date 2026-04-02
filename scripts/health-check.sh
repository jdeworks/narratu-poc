#!/usr/bin/env bash
# health-check.sh — Tier 2 architecture health check
# Outputs warnings to stdout, failures to stderr. Exit 1 on any hard failure.
set -euo pipefail

SOFT_FILE_LOC=${SOFT_FILE_LOC:-250}
HARD_FILE_LOC=${HARD_FILE_LOC:-350}
SOFT_FN_LOC=${SOFT_FN_LOC:-60}
HARD_FN_LOC=${HARD_FN_LOC:-80}
LOC_BUDGET=${LOC_BUDGET:-15000}
SRC_DIR=${SRC_DIR:-src}

# Source file extensions to check. Override with SRC_EXTENSIONS env var.
# Examples: "ts,tsx,js,jsx" (default), "py", "go", "cs", "rs", "rb"
SRC_EXTENSIONS=${SRC_EXTENSIONS:-ts,tsx,js,jsx}

# Test file patterns to exclude from production checks
TEST_PATTERNS=${TEST_PATTERNS:-.test.,.spec.,_test.}

WARN=0
FAIL=0

log_warn() { echo "WARN: $*"; WARN=$((WARN+1)); }
log_fail() { echo "FAIL: $*" >&2; FAIL=$((FAIL+1)); }

# Build find expression from SRC_EXTENSIONS
build_find_expr() {
  local dir="$1"
  local expr=""
  IFS=',' read -ra exts <<< "$SRC_EXTENSIONS"
  for ext in "${exts[@]}"; do
    if [ -n "$expr" ]; then
      expr="$expr -o"
    fi
    expr="$expr -name \"*.$ext\""
  done
  echo "$expr"
}

is_test_file() {
  local name="$1"
  IFS=',' read -ra patterns <<< "$TEST_PATTERNS"
  for pattern in "${patterns[@]}"; do
    if [[ "$name" == *"$pattern"* ]]; then
      return 0
    fi
  done
  return 1
}

# ── File size check ──────────────────────────────────────────────────────────
echo "==> Checking file sizes..."
IFS=',' read -ra exts <<< "$SRC_EXTENSIONS"
find_args=()
for ext in "${exts[@]}"; do
  if [ ${#find_args[@]} -gt 0 ]; then
    find_args+=("-o")
  fi
  find_args+=("-name" "*.$ext")
done

while IFS= read -r -d '' file; do
  loc=$(wc -l < "$file" | tr -d ' ')
  name=$(basename "$file")

  if is_test_file "$name"; then
    soft=400; hard=500
  else
    soft=$SOFT_FILE_LOC; hard=$HARD_FILE_LOC
  fi

  if [ "$loc" -ge "$hard" ]; then
    log_fail "$file: $loc LOC (hard limit $hard) — split this file"
  elif [ "$loc" -ge "$soft" ]; then
    log_warn "$file: $loc LOC (soft limit $soft) — consider splitting"
  fi
done < <(find "$SRC_DIR" -type f \( "${find_args[@]}" \) -print0 2>/dev/null)

# ── console.log check (JS/TS only) ──────────────────────────────────────────
echo "==> Checking for console.log in production files..."
if [[ "$SRC_EXTENSIONS" == *"ts"* || "$SRC_EXTENSIONS" == *"js"* ]]; then
  while IFS= read -r -d '' file; do
    name=$(basename "$file")
    if ! is_test_file "$name"; then
      if grep -q 'console\.log' "$file" 2>/dev/null; then
        log_fail "$file: contains console.log — remove or replace with logger"
      fi
    fi
  done < <(find "$SRC_DIR" -type f \( "${find_args[@]}" \) -print0 2>/dev/null)
fi

# ── Total LOC budget ─────────────────────────────────────────────────────────
echo "==> Checking total LOC budget..."
total=0
while IFS= read -r -d '' file; do
  name=$(basename "$file")
  if ! is_test_file "$name"; then
    loc=$(wc -l < "$file" | tr -d ' ')
    total=$((total + loc))
  fi
done < <(find "$SRC_DIR" -type f \( "${find_args[@]}" \) -print0 2>/dev/null)

echo "    Total source LOC: $total / $LOC_BUDGET"
if [ "$total" -ge "$LOC_BUDGET" ]; then
  log_fail "Total LOC $total exceeds budget $LOC_BUDGET — review scope or raise budget consciously"
elif [ "$total" -ge "$((LOC_BUDGET * 85 / 100))" ]; then
  log_warn "Total LOC $total is at $(( total * 100 / LOC_BUDGET ))% of budget $LOC_BUDGET"
fi

# ── Test coverage check ─────────────────────────────────────────────────────
echo "==> Checking test coverage (file-level)..."
TEST_DIR=${TEST_DIR:-tests}
untested=0
untested_files=""
if [ -d "$SRC_DIR" ] && [ -d "$TEST_DIR" ]; then
  while IFS= read -r -d '' file; do
    name=$(basename "$file")
    if is_test_file "$name"; then
      continue
    fi
    # Strip extension to get the base name
    base="${name%.*}"
    # Convert PascalCase/camelCase to kebab-case for matching
    kebab=$(echo "$base" | sed -E 's/([a-z])([A-Z])/\1-\2/g' | tr '[:upper:]' '[:lower:]')
    lower=$(echo "$base" | tr '[:upper:]' '[:lower:]')
    # Look for any matching test file (case-insensitive, kebab-case, original)
    found=0
    for variant in "$base" "$kebab" "$lower"; do
      for pattern in "${variant}.test" "${variant}.spec" "${variant}_test"; do
        if find "$TEST_DIR" -iname "${pattern}.*" -print -quit 2>/dev/null | grep -q .; then
          found=1
          break 2
        fi
      done
    done
    if [ "$found" -eq 0 ]; then
      untested=$((untested+1))
      untested_files="$untested_files  $file\n"
    fi
  done < <(find "$SRC_DIR" -type f \( "${find_args[@]}" \) -print0 2>/dev/null)

  if [ "$untested" -gt 0 ]; then
    log_warn "$untested source file(s) have no corresponding test file"
    printf "$untested_files" | head -10
    if [ "$untested" -gt 10 ]; then
      echo "  ... and $((untested-10)) more"
    fi
  fi
fi

# ── LLM cost annotation check (if LLM calls exist) ──────────────────────────
echo "==> Checking LLM cost annotations..."
if grep -rq 'messages\.create\|chat\.completions\.create\|generateText\|streamText' "$SRC_DIR" 2>/dev/null; then
  while IFS= read -r -d '' file; do
    name=$(basename "$file")
    if ! is_test_file "$name"; then
      if grep -q 'messages\.create\|chat\.completions\.create\|generateText\|streamText' "$file"; then
        if ! grep -B5 'messages\.create\|chat\.completions\.create\|generateText\|streamText' "$file" | grep -q '@cost'; then
          log_warn "$file: LLM call missing @cost annotation (cheap|moderate|expensive)"
        fi
      fi
    fi
  done < <(find "$SRC_DIR" -type f \( "${find_args[@]}" \) -print0 2>/dev/null)
fi

# ── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo "Health check complete: $WARN warning(s), $FAIL failure(s)"

if [ "$FAIL" -gt 0 ]; then
  echo "Fix failures before proceeding." >&2
  exit 1
fi
if [ "$WARN" -gt 0 ]; then
  echo "Warnings are non-blocking but should be addressed."
fi
