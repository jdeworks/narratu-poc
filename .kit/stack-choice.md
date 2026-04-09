# Stack choice — web frameworks

This variant uses Vite + vanilla JS as its primary example. This doc explains when
to choose a different framework.

## Vanilla HTML/CSS/JS (default)

- **Best for:** Landing pages, portfolios, simple sites, learning web fundamentals
- **Pros:** Zero learning curve, fast, works everywhere, no build complexity
- **Cons:** Gets messy for complex interactive apps, manual DOM manipulation
- The template already uses this. No changes needed.

## Astro

- **Best for:** Content-heavy sites, blogs, documentation, marketing sites
- **Pros:** Ships zero JS by default, extremely fast, supports multiple frameworks (React, Vue, Svelte components inside Astro pages), built-in markdown/MDX
- **Cons:** Smaller ecosystem, not ideal for highly interactive apps
- When to pick: your site is mostly content with occasional interactive islands

## Next.js (React)

- **Best for:** Interactive apps, dashboards, sites needing SSR/SSG/ISR, full-stack React
- **Pros:** Largest React ecosystem, excellent SSR, API routes built-in, Vercel deployment
- **Cons:** Complex configuration, React learning curve, can be heavy for simple sites
- When to pick: you need React and server-side rendering

## Nuxt (Vue)

- **Best for:** Same use cases as Next.js, for Vue teams
- **Pros:** Vue's simpler syntax, excellent DX, auto-imports, built-in state management
- **Cons:** Smaller ecosystem than React/Next
- When to pick: your team prefers Vue's syntax over React

## SvelteKit

- **Best for:** Performance-critical sites, developers who dislike virtual DOM overhead
- **Pros:** Compiles away the framework, smallest bundle sizes, clean syntax
- **Cons:** Smallest ecosystem of the major frameworks, fewer hiring opportunities
- When to pick: performance is paramount and you're comfortable with a smaller community

## Static site generators (Hugo, Jekyll, Eleventy)

- **Best for:** Blogs and docs where you want maximum build speed and minimal JS
- **Pros:** Hugo builds in milliseconds, great for large content sites
- **Cons:** Less flexibility for interactive features, different templating languages
- When to pick: content-only sites with hundreds/thousands of pages

## Decision guide

1. **Simple site, mostly static content?** → Vanilla or Astro
2. **Blog or docs site with lots of pages?** → Astro or Hugo/Eleventy
3. **Interactive app with complex UI state?** → Next.js, Nuxt, or SvelteKit
4. **Learning web development?** → Start vanilla, upgrade later
5. **Team already knows React/Vue/Svelte?** → Use that framework's meta-framework

## Mapping kit patterns to your stack

| Kit concept | Vanilla/Vite | Astro | Next.js | Nuxt | SvelteKit |
|-------------|-------------|-------|---------|------|-----------|
| Dev server | `vite` | `astro dev` | `next dev` | `nuxt dev` | `vite dev` |
| Build | `vite build` | `astro build` | `next build` | `nuxt build` | `vite build` |
| Test runner | Vitest | Vitest | Vitest/Jest | Vitest | Vitest |
| Lint | ESLint | ESLint | ESLint | ESLint | ESLint |
| Format | Prettier | Prettier | Prettier | Prettier | Prettier |
| Static deploy | dist/ | dist/ | out/ (export) | .output/public/ | build/ |

Update `Makefile` targets to match your stack's commands.
