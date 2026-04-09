# Testing

Three tiers. All three are required in full mode. Tier 1 is required in lean mode.

---

## Tier 1 — Feature tests (all modes)

Test what the code does. Every exported function, route, schema, and utility needs at least one test.

**Rules:**
- No feature is "done" until it has passing tests — this is not negotiable
- Test the contract (inputs → outputs), not the implementation
- Prefer integration tests over unit tests where they're not significantly slower
- Use realistic fixtures, not `foo` / `bar` / `123`

**What to test:**
- Happy path (correct inputs → correct output)
- Edge cases (empty arrays, null, zero, max values)
- Error cases (invalid inputs → expected error)
- Boundary conditions specific to your domain

**What not to test:**
- Third-party library internals
- Framework boilerplate (e.g. that Express routes are registered)
- Trivial getters/setters with no logic

---

## Tier 2 — Architecture tests (full mode)

Test how the code is shaped. These run as part of `make health` and enforce the rules in
`.kit/code-health.md` automatically.

**What's checked:**
- File size within limits (warn at soft, fail at hard)
- Function length within limits
- No `console.log` in production source files
- No circular dependencies
- Dead exports detected (knip)
- Total LOC within project budget
- Cyclomatic complexity within ceiling

**Writing custom architecture tests:**
For conventions that can't be expressed in ESLint or the health script, write explicit test cases:

```ts
// tests/architecture/folder-conventions.test.ts
import { globSync } from 'glob'
import { describe, it, expect } from 'vitest'

describe('folder conventions', () => {
  it('components/ only contains .tsx files', () => {
    const files = globSync('src/components/**/*.*')
    const nonTsx = files.filter(f => !f.endsWith('.tsx') && !f.endsWith('.test.tsx'))
    expect(nonTsx).toEqual([])
  })

  it('utils/ does not import from components/', () => {
    const files = globSync('src/utils/**/*.ts')
    for (const f of files) {
      const content = readFileSync(f, 'utf8')
      expect(content).not.toMatch(/from ['"].*\/components\//)
    }
  })
})
```

Keep architecture tests fast — they should run in under 2 seconds total.

---

## Tier 3 — LLM integration tests (full mode, when project uses LLMs)

See `.kit/llm-testing.md` for the full guide. Summary:

- **Mock all LLM calls in unit/integration tests** — never hit a real API in the test suite
- **Prompt shape tests** — assert your prompt template contains required elements
- **Response validation tests** — validate the structure of LLM responses with Zod before use
- **Cost annotations** — every LLM call has `@cost cheap|moderate|expensive` in JSDoc

If your project makes no LLM calls, skip Tier 3. Note this in AGENTS.md.

---

## Tier 4 — Browser verification (full mode, projects with UI)

If the project has a user interface, runtime verification in a real browser is required. Unit tests
alone miss console errors, broken layouts, and interaction bugs.

**What's checked:**
- Page loads without console errors or uncaught exceptions
- Core user flows complete without errors
- Touch targets meet accessibility minimums (44px)
- No horizontal overflow on mobile viewports
- Input font sizes prevent iOS auto-zoom (>= 16px)

**Required test: console error gate**

Every project with UI must have at minimum:

```ts
import { test, expect } from '@playwright/test'

test('no console errors on page load', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', err => errors.push(err.message))
  await page.goto('/')
  await page.waitForTimeout(2000)
  expect(errors).toHaveLength(0)
})
```

**Screenshot capture:**

Configure Playwright to capture screenshots on failure for debugging:

```ts
// playwright.config.ts
use: {
  screenshot: 'only-on-failure',
  trace: 'retain-on-failure',
}
```

**When to run:** After any UI change. Run via `make e2e` (standalone) or `make verify` (full pipeline).

For monorepos: after changing a shared package, run e2e for ALL consuming apps.

See `.kit/verification.md` for the full "definition of done" checklist.

---

## Running tests

```bash
make test           # tiers 1-3
make test-feature   # tier 1 only
make health         # tier 2 only (architecture)
make e2e            # tier 4 only (browser — requires dev server)
make check          # full quality pipeline (tiers 1-3 + lint + types + health)
make verify         # check + e2e (the gold standard for "done")
npx vitest run      # raw vitest (no Makefile)
npx playwright test # raw playwright (no Makefile)
```

## Regression tests — learning from CHANGES.md

The change log is not just a record — it's a feedback loop. Use it to grow test coverage
where it matters most.

### Every fix gets a test

When you fix a bug, add a test that would have caught it:

```ts
// src/billing/webhook.test.ts
test('handles duplicate webhook events idempotently', () => {
  // This test was added after a bug where duplicate Stripe events caused double charges.
  // See CHANGES.md [2026-03-28] session-c3d4
  const result1 = handleWebhook(event)
  const result2 = handleWebhook(event) // same event again
  expect(result1.processed).toBe(true)
  expect(result2.processed).toBe(false) // duplicate skipped
})
```

Log it in CHANGES.md with `tests_added:` so future sessions can verify it exists.

### Spotting patterns at session start

At session start, scan recent CHANGES.md entries for:

1. **Repeated fixes in the same area** — if `src/auth/` has 3 fix entries in the last 5
   sessions, that area needs more thorough tests. Add edge case tests proactively.
2. **Refactors without tests_added** — if code was restructured but no new tests were
   written, the refactor may have gaps. Review test coverage for those files.
3. **Symbols added without tests** — if `symbols_added` lists new exports but `tests_added`
   is empty, those exports may be untested. Add at least one test per export.

### Validating against git history

When git is available, cross-check CHANGES.md against reality:

```bash
# Run: bash scripts/verify-changes.sh
# Checks:
# 1. files_touched entries match actual git diff
# 2. tests_added files actually exist
# 3. fix-type entries have tests_added (warns if missing)
# 4. symbols_removed are actually gone from the codebase
```

This is automated by `scripts/verify-changes.sh` (runs as part of `make check` in full mode).

### The learning loop

```
Bug found → Fix it → Add regression test → Log in CHANGES.md
                                                    ↓
Next session starts → Read CHANGES.md → See patterns
                                            ↓
                                    Add preventive tests for weak areas
                                            ↓
                                    Fewer bugs in that area over time
```

The kit gets smarter about your project as CHANGES.md grows. Areas that break often
get denser test coverage. Areas that are stable stay lean.

---

## Test file location

Co-locate tests with source by default:
```
src/
  auth/
    login.ts
    login.test.ts     ← lives next to the file it tests
  utils/
    format.ts
    format.test.ts
tests/
  architecture/       ← tier 2 tests live here, separate from source
  integration/        ← integration tests that span multiple modules
```
