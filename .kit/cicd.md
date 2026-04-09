# CI/CD with GitHub Actions

Automated testing and deployment for your website.

## CI workflow (test on every push)

```yaml
# .github/workflows/ci.yml
name: CI
on:
  push:
    branches: [main, dev]
  pull_request:
    branches: [main]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run test:run
      - run: npm run build
```

## Status badge

Add to your README:
```markdown
![CI](https://github.com/USERNAME/REPO/actions/workflows/ci.yml/badge.svg)
```

## Combining CI with deploy

If deploying to GitHub Pages, you can combine CI checks and deployment:

1. Keep `ci.yml` for PRs (test only, no deploy)
2. Keep `deploy.yml` for pushes to main (test + deploy)

Or use a single workflow with conditions:
```yaml
- run: npm run build
- if: github.ref == 'refs/heads/main'
  uses: actions/deploy-pages@v4
```

## Tips

- Never skip CI — if tests are slow, make them faster, don't skip them
- Match the Node.js version in CI to your local development version
- Keep CI under 2 minutes — if it's slower, parallelize or split jobs
- Use `npm ci` (not `npm install`) in CI for deterministic builds
