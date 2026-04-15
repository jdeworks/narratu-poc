#!/usr/bin/env bash
# verify-browser.sh — browser verification with console error capture and screenshots
# Runs Playwright tests and reports results. Used by `make e2e` and `make verify`.
# Can also be run standalone for a quick smoke check.
set -uo pipefail

# ── Find Playwright configs ────────────────────────────────────────────────
configs=()
if [ -f "playwright.config.ts" ] || [ -f "playwright.config.js" ]; then
  configs+=(".")
fi
for cfg in apps/*/playwright.config.ts apps/*/playwright.config.js; do
  [ -f "$cfg" ] && configs+=("$(dirname "$cfg")")
done

if [ ${#configs[@]} -eq 0 ]; then
  echo "No playwright.config.* found — skipping browser verification"
  exit 0
fi

# ── Prepare output dir ─────────────────────────────────────────────────────
mkdir -p .verify
SUMMARY=".verify/last-summary.txt"
> "$SUMMARY"

overall_pass=true

for dir in "${configs[@]}"; do
  echo "── Running Playwright in $dir ──"
  echo "=== $dir ===" >> "$SUMMARY"

  if npx playwright test --config "$dir/playwright.config.ts" 2>&1 | tee -a "$SUMMARY"; then
    echo "PASS: $dir" >> "$SUMMARY"
  else
    echo "FAIL: $dir" >> "$SUMMARY"
    overall_pass=false
  fi
  echo "" >> "$SUMMARY"
done

# ── Write timestamp marker ─────────────────────────────────────────────────
date +%s > .verify/last-check

# ── Report ─────────────────────────────────────────────────────────────────
echo ""
echo "── Browser verification summary ──"
if $overall_pass; then
  echo "All browser tests passed."
  echo "Results: $SUMMARY"
else
  echo "FAILURES detected. See $SUMMARY for details."
  echo "Fix failures before declaring work done."
  exit 1
fi
