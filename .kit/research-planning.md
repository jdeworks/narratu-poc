# Research and planning

Before implementing a non-trivial feature, write a spec. This takes 10-30 minutes and saves
hours of backtracking. The spec is the source of truth for what the feature does, what it
touches, and what tests it needs.

---

## When to write a spec

Write one when:

- The feature touches more than 3 files
- You're unsure about the architecture or data model
- The feature has external dependencies (API integrations, new DB tables, auth changes)
- Multiple approaches are possible and you haven't decided between them

Skip the spec for:

- Bug fixes with a clear root cause
- Small additions to existing patterns (adding a new route that follows the existing pattern)
- Config and tooling changes

---

## Spec format

Create `.kit/features/<feature-name>.md`:

```md
# Feature: <name>

## What it does (one paragraph)

...

## What it doesn't do (non-goals)

...

## Files touched

- `src/...` — reason
- `src/...` — reason

## New symbols

- `FunctionName` in `src/...` — purpose
- `TypeName` in `src/...` — purpose

## Tests needed

- Unit: ...
- Integration: ...
- Architecture: any new conventions to enforce?

## Open questions

- [ ] Question 1
- [ ] Question 2

## Decision log

- [YYYY-MM-DD] Decided X over Y because Z
```

---

## The planning loop

1. **Read** related existing files before writing anything
2. **Check CHANGES.md** — has this area been touched recently? Any pending dead code?
3. **Write the spec** in `.kit/features/<name>.md`
4. **Review open questions** — resolve them before starting implementation
5. **Implement** with the spec open, updating it as decisions are made
6. **Update CHANGES.md** at session end

---

## For complex architecture decisions: use think-tank

When a feature involves significant architecture choices — new data model, new service boundary,
integration with an external system — use think-tank to iron out the details before writing code.

**think-tank** (github.com/jdeworks/think-tank) is an AI-guided planning tool that walks you
through architecture, tech stack, security, and trade-offs via structured conversation.

Run it on the feature before writing the spec:

1. Describe the feature in think-tank
2. Answer its questions about architecture, constraints, and trade-offs
3. Export the resulting plan as Markdown
4. Use that as the basis for your `.kit/features/<name>.md` spec

This is a soft recommendation, not a hard dependency. Small features don't need it.

---

## Checking existing patterns before adding new ones

Before implementing anything, check if the pattern already exists:

```bash
# Find how auth is currently handled
grep -r "authenticate\|verifyToken\|session" src/ --include="*.ts" -l

# Find existing error handling patterns
grep -r "AppError\|handleError\|catch" src/ --include="*.ts" -l

# Find test patterns for this kind of code
ls tests/ src/**/*.test.ts
```

Agents tend to invent new patterns when existing ones would do. Reading first saves refactoring later.
