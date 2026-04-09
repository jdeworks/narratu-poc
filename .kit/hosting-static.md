# Hosting — static sites

How to deploy static sites built with Vite (or any build tool that outputs to a `dist/` folder).

## Platform options

| Platform | Best for | Free tier |
|----------|----------|-----------|
| **GitHub Pages** | Open source, portfolio sites | Unlimited for public repos |
| **Vercel** | Next.js, preview deploys | Generous (hobby tier) |
| **Netlify** | Form handling, edge functions | 100 GB/month bandwidth |
| **Cloudflare Pages** | Global CDN, fast | Unlimited bandwidth |

All provide HTTPS automatically.

## GitHub Pages (with GitHub Actions)

### 1. Configure build output

For Vite, set the base path if deploying to a repo subdirectory:

```javascript
// vite.config.js
export default defineConfig({
  base: '/repo-name/',  // only needed for repo sites, not user.github.io
})
```

### 2. Create the deploy workflow

```yaml
# .github/workflows/deploy.yml
name: Deploy to GitHub Pages
on:
  push:
    branches: [main]
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: pages
  cancel-in-progress: true
jobs:
  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist
      - id: deployment
        uses: actions/deploy-pages@v4
```

### 3. Enable GitHub Pages

Go to repo Settings → Pages → Source → **GitHub Actions**.

### SPA routing fix

For single-page apps with client-side routing, copy `index.html` to `404.html` so all
routes resolve:

```bash
# Add to your build script
cp dist/index.html dist/404.html
```

### Custom domain

1. Add a `CNAME` file to `public/` containing your domain: `www.example.com`
2. Configure DNS: CNAME record pointing to `username.github.io`

## Vercel

```bash
npm i -g vercel
vercel          # first deploy (interactive setup)
vercel --prod   # production deploy
```

Or connect your GitHub repo at vercel.com for automatic deploys on push.

## Netlify

```bash
npm i -g netlify-cli
netlify init    # connect to Netlify
netlify deploy  # preview deploy
netlify deploy --prod  # production deploy
```

Or drag-and-drop your `dist/` folder at app.netlify.com.

## Cloudflare Pages

Connect your GitHub repo at dash.cloudflare.com → Pages. Set build command to `npm run build`
and output directory to `dist`.

## Dev vs. production feature gating

Use this pattern to detect dev environments and hide dev-only features on production (e.g. GitHub Pages):

```typescript
export const IS_DEV = typeof window !== "undefined" &&
  (window.location.hostname === "localhost" ||
   window.location.hostname === "127.0.0.1" ||
   window.location.hostname.endsWith(".trycloudflare.com"));
```

Mark providers or features with `devOnly: true` and filter them in the UI:

```typescript
const providers = allProviders.filter(p => IS_DEV || !p.devOnly);
```

This keeps debug tools, local-only TTS providers, mock APIs, etc. out of the production build
without `#ifdef`-style conditionals scattered through the codebase.

## Cloudflare tunnel for mobile testing

When using Cloudflare tunnels (`cloudflared tunnel`) to test on mobile devices, Vite blocks
external hostnames by default. Add this to `vite.config.ts`:

```typescript
preview: { allowedHosts: true },
```

This allows the tunnel hostname through during `vite preview`. For `vite dev`, use
`server: { host: true }` as well.

## Verify

- [ ] Site loads at the deployed URL
- [ ] HTTPS working (green lock)
- [ ] All pages/routes load correctly
- [ ] Images and assets load
- [ ] Custom domain working (if configured)
