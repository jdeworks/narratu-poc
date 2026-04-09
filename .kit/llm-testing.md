# LLM integration testing

> **Token cost note:** Running real LLM calls in tests costs money and is non-deterministic.
> Everything in this doc is designed to give you confidence in your LLM integration *without*
> hitting the API in your test suite. Real API calls belong in a separate, manually-triggered
> integration suite — not in `make test`.

---

## The core problem

LLM-calling code has two failure modes that normal tests don't catch:

1. **Prompt drift** — your prompt template changes in a way that removes a critical instruction.
   The LLM still responds, just worse. No error is thrown. Your tests still pass.

2. **Response shape drift** — the LLM returns something slightly different than you expected
   (a missing field, a string where you expected an array). Your code silently fails or crashes
   in production.

These docs cover how to catch both.

---

## Rule 1: Always mock LLM calls in tests

Every function that calls an LLM should accept the client as a parameter (dependency injection),
so tests can swap in a mock:

```ts
// src/summarise.ts
export async function summarise(
  text: string,
  client: Pick<Anthropic, 'messages'> = new Anthropic()
): Promise<Summary> {
  const response = await client.messages.create({ ... })
  return parseSummary(response)
}

// src/summarise.test.ts
const mockClient = {
  messages: {
    create: vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: '{"title":"Test","points":["a","b"]}' }]
    })
  }
}

it('parses a valid summary response', async () => {
  const result = await summarise('some text', mockClient)
  expect(result.title).toBe('Test')
})
```

Mock fixtures should be realistic — copy an actual API response shape, not a minimal stub.
Keep fixture files in `tests/fixtures/llm/` so they're easy to update when the API schema changes.

---

## Rule 2: Prompt shape tests

Assert that the prompt your code builds contains the required elements.
This catches prompt regressions before they reach the LLM.

```ts
// src/summarise.test.ts
it('prompt includes the source text', () => {
  const prompt = buildSummaryPrompt('my important text')
  expect(prompt).toContain('my important text')
})

it('prompt requests JSON output', () => {
  const prompt = buildSummaryPrompt('text')
  expect(prompt).toMatch(/json|JSON/)
})

it('prompt includes the output schema', () => {
  const prompt = buildSummaryPrompt('text')
  expect(prompt).toContain('title')
  expect(prompt).toContain('points')
})
```

**Key insight:** If `buildSummaryPrompt` is a pure function (text in → string out), it's trivial
to test without any mock. Extract prompt construction into pure functions whenever possible.

---

## Rule 3: Response validation with Zod

Parse every LLM response through a Zod schema before your code uses it.
This makes response shape drift a catchable runtime error, not a silent bug.

```ts
import { z } from 'zod'

const SummarySchema = z.object({
  title: z.string().min(1),
  points: z.array(z.string()).min(1).max(10),
  sentiment: z.enum(['positive', 'neutral', 'negative']).optional()
})

export type Summary = z.infer<typeof SummarySchema>

async function parseSummary(response: APIResponse): Promise<Summary> {
  const text = response.content[0].text
  const json = JSON.parse(text)
  return SummarySchema.parse(json) // throws ZodError with clear message on bad shape
}
```

Test the schema directly:
```ts
it('accepts a valid summary', () => {
  expect(() => SummarySchema.parse({ title: 'T', points: ['a'] })).not.toThrow()
})
it('rejects a summary with no points', () => {
  expect(() => SummarySchema.parse({ title: 'T', points: [] })).toThrow()
})
```

---

## Rule 4: Cost annotations

Every LLM call in the codebase must have a `@cost` JSDoc annotation.
The Tier 2 architecture test checks these are present on all `client.messages.create` calls.

```ts
/**
 * Summarises a document using Claude.
 * @cost moderate — ~500 input tokens, ~200 output tokens per call
 */
export async function summarise(text: string): Promise<Summary> { ... }
```

Cost tiers:
- `cheap` — < 1K tokens total, called infrequently
- `moderate` — 1K-10K tokens, or called on a hot path
- `expensive` — > 10K tokens, or called in loops / batch jobs

---

## Rule 5: LLM usage documentation

Maintain a `.kit/llm-usage.md` file that describes every LLM call in plain English.
This is the file another AI tool (ChatGPT, Gemini, a future agent) reads to understand
your LLM integration without reading source code.

Template per call:
```md
### summarise()
**File:** src/summarise.ts
**Purpose:** Converts a long document into a structured summary with title and bullet points.
**Input:** Raw text, max ~4000 words
**Output:** `{ title: string, points: string[] }` — validated by SummarySchema
**Model:** claude-sonnet-4-6 (configurable via env)
**Cost:** moderate (~700 tokens per call)
**Called by:** POST /api/documents/:id/summarise
**Test coverage:** Unit tests in src/summarise.test.ts (mocked); integration test in tests/integration/summarise.test.ts (real API, manual trigger only)
```

Update this file whenever you add, modify, or remove an LLM call.

---

## Real API integration tests (optional, manual)

Keep a separate suite that hits the real API, behind a guard:

```ts
// tests/integration/summarise.real.test.ts
const runRealTests = process.env.RUN_REAL_LLM_TESTS === 'true'

describe.skipIf(!runRealTests)('summarise — real API', () => {
  it('returns a valid summary for a 500-word document', async () => {
    const result = await summarise(fixture500words)
    expect(SummarySchema.safeParse(result).success).toBe(true)
  })
})
```

Run with: `RUN_REAL_LLM_TESTS=true npx vitest run tests/integration`

Never include real API tests in `make test` or CI.
