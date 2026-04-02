# Git and GitHub best practices

Guidelines for version control, commit hygiene, and collaboration workflows.

## Commit often

- Commit after every meaningful change — don't accumulate a day's work in one commit
- Each commit should be a single logical change that could be reverted independently
- If you're unsure whether to commit: commit. Small commits are easier to review, revert, and bisect
- Aim for commits that pass tests — don't commit broken code to shared branches

## Commit messages

```
<type>: <what changed> (short, imperative, <72 chars)

Optional body explaining why, not what. The diff shows what.
```

Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `ci`

**Good:**

```
feat: add user email verification flow
fix: prevent duplicate webhook processing
refactor: extract billing logic from route handler
```

**Bad:**

```
update stuff
wip
fix bug
changes
```

## Branching strategy

Keep it simple:

```
main        ← production-ready, always deployable
  └── dev   ← integration branch (optional)
       └── feature/add-billing    ← your work
       └── fix/login-redirect     ← your work
```

- `main` is always deployable. Never push broken code directly to main.
- Feature branches are short-lived — merge within days, not weeks.
- Delete branches after merging.

## Pre-commit hooks

Use pre-commit hooks to catch problems before they reach CI. Fast checks only — keep hooks under 5 seconds.

### Setup with plain git hooks (no dependencies)

The simplest approach — works with any language, no npm required:

```bash
mkdir -p .githooks
git config core.hooksPath .githooks
```

`.githooks/pre-commit`:

```bash
#!/usr/bin/env bash
set -euo pipefail
# Add your fast checks here
make lint 2>/dev/null || true
make format 2>/dev/null || true
```

```bash
chmod +x .githooks/pre-commit
```

This is what the starter kit itself uses. The hooks are committed to the repo so
every contributor gets them after running `git config core.hooksPath .githooks`.

### Setup with Husky (Node.js)

```bash
npm install -D husky lint-staged
npx husky init
```

`.husky/pre-commit`:

```bash
npx lint-staged
```

`package.json`:

```json
{
  "lint-staged": {
    "*.{ts,tsx,js,jsx}": ["eslint --fix", "prettier --write"],
    "*.{json,md,css}": ["prettier --write"]
  }
}
```

### Setup with pre-commit (Python)

```bash
pip install pre-commit
```

`.pre-commit-config.yaml`:

```yaml
repos:
  - repo: https://github.com/astral-sh/ruff-pre-commit
    rev: v0.4.0
    hooks:
      - id: ruff
      - id: ruff-format
```

### What to run in pre-commit hooks

| Check                     | Time  | Include?            |
| ------------------------- | ----- | ------------------- |
| Format (Prettier, gofmt)  | <1s   | Yes                 |
| Lint (ESLint, ruff)       | 1-3s  | Yes                 |
| Type check (tsc --noEmit) | 2-5s  | Yes, if fast enough |
| Unit tests                | 1-10s | Only fast tests     |
| Full test suite           | 10s+  | No — run in CI      |
| Build                     | 10s+  | No — run in CI      |

**Rule:** if a hook takes more than 5 seconds, move it to CI instead.

### Fast test subset for pre-commit

Run only tests related to changed files:

```bash
# Vitest — run only related tests
npx vitest related --run $(git diff --cached --name-only)

# pytest — run only tests matching changed files
pytest --co -q | grep "$(git diff --cached --name-only | sed 's/\.py//' | tr '\n' '|')"

# Go — run tests in changed packages only
go test $(git diff --cached --name-only | xargs -I{} dirname {} | sort -u | sed 's|^|./|')
```

## Pull requests

- Keep PRs small — under 400 lines changed is ideal
- Write a clear title and description (what, why, how to test)
- Request review from at least one person
- Address review comments before merging
- Squash-merge to keep main history clean (or rebase-merge for granular history)

### PR description template

```markdown
## What

One-sentence summary of the change.

## Why

Context: what problem does this solve?

## How to test

1. Step-by-step instructions
2. Expected result

## Screenshots (if UI change)
```

## Branch protection (recommended)

Enable on `main`:

- [x] Require pull request reviews (at least 1)
- [x] Require status checks to pass (CI)
- [x] Require branches to be up to date before merging
- [x] Do not allow bypassing the above settings

## .gitignore essentials

Every project should ignore:

```
node_modules/     # Dependencies (reinstall with npm install)
dist/ build/      # Build output (regenerated)
.env .env.*       # Secrets (use .env.example as template)
!.env.example     # Keep the example
coverage/         # Test coverage reports
*.log             # Log files
.DS_Store         # macOS metadata
```

## Secrets

- Never commit secrets (API keys, passwords, tokens)
- Use `.env` files locally (in `.gitignore`)
- Use GitHub Secrets or your CI's secret store for CI/CD
- If you accidentally commit a secret: rotate it immediately, then remove from git history with `git filter-branch` or BFG Repo-Cleaner

## GitHub Actions

See the variant-specific `.kit/cicd.md` for CI/CD setup. General rules:

- CI should run on every PR and push to main
- Keep CI under 5 minutes for PRs
- Use caching (`actions/cache` or `setup-node/cache: npm`) to speed up installs
- Pin action versions (`actions/checkout@v4`, not `@latest`)
