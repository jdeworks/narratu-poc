# Retrospective — Lessons Learned

Write a "Lessons Learned" section in the README at the end of a project (or a major milestone).
This is a self-review: what went well, what didn't, what was learned. It serves future projects
and future developers — including AI agents starting new sessions.

---

## When to write

- End of a PoC or MVP phase
- After a major refactor or provider switch
- When the project reaches v1.0 or a stable release
- Before archiving or handing off the project

## What to include

Each lesson follows this structure:

```markdown
### N. Short title — scope hint (~iteration count)

**Problem:** What went wrong or was harder than expected.

**What was tried:** The wrong turns, failed approaches, things that seemed
right but weren't. Include specific details (function names, values, algorithms).

**Fix / What worked:** The solution that stuck. Why it worked when others didn't.

**Side effects:** Unexpected consequences of the fix (optional).

**Takeaway:** One or two sentences a future developer can act on without reading
the full story. Make it general enough to apply to other projects.
```

## What makes a good lesson

- **Tells a story, not just a fix.** Include the wrong turns — that's where the learning is.
- **Names specific things.** "The volume was wrong" is useless. "Hardcoded 44100 Hz but
  AudioContext decodes at 48000 Hz" is actionable.
- **Quantifies when possible.** "16 → 7 false positives after prompt fix" beats "fewer false positives."
- **Generalizes the takeaway.** The story is project-specific; the takeaway should apply elsewhere.

## What to avoid

- Don't list features built. That's what CHANGES.md is for.
- Don't describe architecture. That's what AGENTS.md is for.
- Don't write lessons for things that went smoothly — only things that were surprisingly hard,
  required multiple attempts, or taught something non-obvious.
- Don't be vague. "Testing is important" is not a lesson. "TTS artifacts only appear at scale —
  test with 60+ segments, not 3" is a lesson.

## Good categories to look for

When reviewing sessions for lessons, look for:

1. **Provider/library switches** — why did the first choice fail? What were the signs?
2. **Multi-attempt bugs** — anything that took 3+ tries to fix. What was the wrong mental model?
3. **Architecture decisions that paid off** — what foresight saved rework later?
4. **Architecture decisions that didn't** — what seemed smart but created problems?
5. **Performance surprises** — where did the actual bottleneck differ from expectation?
6. **Integration mismatches** — sample rates, data formats, API quirks, browser differences.
7. **Accumulated debt** — dead code, divergent code paths, copy-pasted logic that drifted.
8. **LLM boundaries** — where did AI help vs. where did it need human correction?

## How to extract from CHANGES.md

1. Read all progress lines across all sessions
2. Look for clusters: same file touched 3+ times, same problem mentioned in multiple lines
3. Look for reversals: "added X" followed by "removed X" or "replaced X with Y"
4. Look for escalating fixes: "fixed A" → "also fixed B caused by A fix" → "rewrote A entirely"
5. Each cluster or reversal is a candidate lesson

## Example

See the Narratu README or Noodle Jump README for full examples of this format in practice.
