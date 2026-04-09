# Verification — definition of done

A task is not "done" when the code compiles. It's done when it's **proven correct**.

---

## Definition of done checklist

Before declaring any task complete:

- [ ] All tests pass (`make test`)
- [ ] No TypeScript errors (`make types`)
- [ ] No lint errors (`make lint`)
- [ ] No dead code introduced (`make deadcode`)
- [ ] `make check` passes clean
- [ ] `make e2e` passes (if project has a `playwright.config.*`)
- [ ] No console errors in the browser
- [ ] Core user flows work — not just the flow you changed
- [ ] CHANGES.md progress line logged
- [ ] Work committed

For UI changes, additionally:
- [ ] Page loads without errors on mobile, tablet, and desktop viewports
- [ ] Screenshots captured if layout changed (Playwright `--update-snapshots` or manual)

---

## Console error gate

**Console errors are bugs.** Treat them with the same urgency as test failures.

- If any `console.error` or uncaught exception exists in the browser, fix it before continuing
- Do not filter out or ignore errors unless they're from third-party code you can't control
- After fixing, re-run `make e2e` to confirm the fix holds
- Never claim "done" while console errors exist

---

## Proof of done

**Never claim success without verification output.**

When you say a task is done, include at least one of:
- Test results summary showing all tests pass
- `make check` / `make verify` output showing clean pass
- Screenshot or Playwright output for UI changes
- Console log excerpt showing zero errors

If you can't show proof, it's not done.

---

## Phase discipline

Do not mix implementation and verification. Work in phases:

1. **Implement** — write the code
2. **Test** — write/update tests for the change
3. **Verify** — run `make verify` (or `make check` for non-UI projects)
4. **Fix** — if anything fails, fix and re-verify
5. **Log** — progress line in CHANGES.md, commit
6. **Next** — only now move to the next task

Do NOT proceed to the next task until the current one passes verification.

---

## Task scoping

### One task, one verify cycle

Complete and verify each task before starting the next. Don't batch multiple features into
one verification pass. Batching hides which change broke what.

### Compress at task boundaries

If context is running low:
1. Finish the current task
2. Run `make verify` (or `make check`)
3. Commit all passing work
4. Log completed entry in CHANGES.md
5. Then compress or start a new session

The next session starts with a clean, verified codebase.

### If you must compress mid-task

If you truly can't finish before context runs out:
1. Run `make check` to capture current state
2. Commit whatever passes (even partial)
3. Note in SESSION_SUMMARY.md: what's done, what's broken, what's next
4. The next session re-runs `make check` first to establish the baseline before continuing

---

## Browser verification patterns

### Minimal smoke test (every project with UI should have this)

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

### Core flow test template

```ts
test('core user flow completes', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', err => errors.push(err.message))

  // Navigate through core flow
  await page.goto('/')
  // ... click through steps ...

  // Assert: no errors, expected result visible
  expect(errors).toHaveLength(0)
  await expect(page.locator('[data-testid="success"]')).toBeVisible()
})
```

### Screenshot on failure (Playwright config)

```ts
// playwright.config.ts
export default defineConfig({
  use: {
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
})
```

---

## Running verification

```bash
make check      # quality pipeline (no browser) — use for backend-only projects
make e2e        # browser tests only (requires dev server running)
make verify     # check + e2e — the gold standard for "done"
```

For monorepos: `make verify` runs e2e for all apps that have a playwright config.
After changing a shared package, verify ALL consuming apps — not just the one you changed.
