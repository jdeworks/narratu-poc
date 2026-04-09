# Browser testing — website variant

Browser tests catch what unit tests miss: console errors, broken layouts, interaction bugs,
and accessibility failures. Every website project should have at minimum a console error gate
and core flow tests.

---

## Setup

Install Playwright:
```bash
npm install -D @playwright/test
npx playwright install chromium
```

Minimal config (`playwright.config.ts`):
```ts
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3000',  // adjust to your dev port
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'mobile',
      use: { browserName: 'chromium', viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true },
    },
    {
      name: 'tablet',
      use: { browserName: 'chromium', viewport: { width: 768, height: 1024 } },
    },
    {
      name: 'desktop',
      use: { browserName: 'chromium', viewport: { width: 1280, height: 800 } },
    },
  ],
})
```

---

## Required: console error gate

This test alone eliminates a large percentage of "looks done but is broken":

```ts
import { test, expect } from '@playwright/test'

test('no console errors on page load', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', err => errors.push(err.message))
  await page.goto('/')
  await page.waitForTimeout(2000)
  // Filter known benign third-party errors if needed
  const realErrors = errors.filter(e =>
    !e.includes('ResizeObserver')
  )
  expect(realErrors, `Console errors:\n${realErrors.join('\n')}`).toHaveLength(0)
})
```

Add one of these for every major route/page in your app.

---

## Core flow tests

Test the flows users actually use, not just isolated components:

```ts
test.describe('Core user flow', () => {
  test('user can complete primary action', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', err => errors.push(err.message))

    await page.goto('/')
    // Navigate to the feature
    await page.click('[data-testid="start-button"]')
    // Fill in required fields
    await page.fill('[name="email"]', 'test@example.com')
    // Submit
    await page.click('[type="submit"]')
    // Assert success state
    await expect(page.locator('[data-testid="success"]')).toBeVisible()
    // Assert no errors throughout
    expect(errors).toHaveLength(0)
  })
})
```

---

## Responsive and accessibility checks

```ts
const MIN_TOUCH_TARGET = 44

test('buttons meet 44px touch target minimum', async ({ page }) => {
  await page.goto('/')
  const buttons = page.locator('button:visible')
  const count = await buttons.count()
  const violations: string[] = []
  for (let i = 0; i < count; i++) {
    const box = await buttons.nth(i).boundingBox()
    if (!box) continue
    if (box.width < MIN_TOUCH_TARGET && box.height < MIN_TOUCH_TARGET) {
      const label = await buttons.nth(i).getAttribute('aria-label') ?? `button[${i}]`
      violations.push(`"${label}" is ${Math.round(box.width)}x${Math.round(box.height)}px`)
    }
  }
  expect(violations, `Touch violations:\n${violations.join('\n')}`).toHaveLength(0)
})

test('no horizontal overflow on mobile', async ({ page }) => {
  await page.goto('/')
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth > document.documentElement.clientWidth
  )
  expect(overflow).toBe(false)
})

test('input fonts prevent iOS zoom (>= 16px)', async ({ page }) => {
  await page.goto('/')
  const inputs = page.locator('input:visible, textarea:visible, select:visible')
  const count = await inputs.count()
  for (let i = 0; i < count; i++) {
    const fontSize = await inputs.nth(i).evaluate(el =>
      parseFloat(window.getComputedStyle(el).fontSize)
    )
    expect(fontSize, `Input ${i} font size`).toBeGreaterThanOrEqual(16)
  }
})
```

---

## Running

```bash
make e2e            # run all Playwright tests (dev server must be running)
make verify         # full pipeline: check + e2e
npx playwright test # raw command
npx playwright test --ui  # interactive mode for debugging
```

---

## When to write new browser tests

- Adding a new page or route
- Changing navigation or layout
- Adding interactive features (modals, forms, dropdowns)
- Fixing a visual or interaction bug (regression test)
- Any change that a user would see
