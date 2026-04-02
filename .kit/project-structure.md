# Project structure

How to organize files based on project type.

## Static site (vanilla)

```
my-site/
  public/           # Static assets (images, fonts, favicon) — copied as-is
    favicon.svg
  src/
    style.css       # CSS entry point (Tailwind or plain CSS)
    main.js         # JS entry point
    utils/          # Helper functions
  index.html        # Main HTML file
  vite.config.js
  package.json
```

## React app

```
my-site/
  public/
    favicon.svg
  src/
    components/     # Reusable UI components
      Header.jsx
      Footer.jsx
    pages/          # Page-level components (or use router)
      Home.jsx
      About.jsx
    hooks/          # Custom React hooks
    utils/          # Helper functions
    App.jsx         # Root component
    main.jsx        # Entry point
    style.css       # CSS entry point
  index.html
  vite.config.js
  package.json
```

## Astro site

```
my-site/
  public/
    favicon.svg
  src/
    components/     # .astro or framework components
    layouts/        # Page layouts
      Base.astro
    pages/          # File-based routing
      index.astro
      about.astro
    content/        # Markdown/MDX content (blog posts, etc.)
    styles/
      global.css
  astro.config.mjs
  package.json
```

## Server-rendered site (Express example)

```
my-site/
  public/           # Frontend files served by the server
    index.html
    style.css
    main.js
  routes/           # API route handlers
    items.js
  data/             # Database directory
    app.db
  server.js         # Server entry point
  package.json
```

## File naming conventions

- **HTML/CSS/JS files:** kebab-case — `my-component.js`, `hero-section.css`
- **React/Vue/Svelte components:** PascalCase — `Header.jsx`, `UserProfile.vue`
- **Utilities/hooks:** camelCase — `useAuth.js`, `formatDate.js`
- **Config files:** lowercase — `vite.config.js`, `package.json`
- **Test files:** match source name with `.test` suffix — `helpers.test.js`

## When to split files

- **Over 200 lines** — split into smaller files
- **Reused in 2+ places** — extract to its own file
- **Distinct responsibility** — separate concerns (data fetching vs. rendering)

## Rules

- Keep `index.html` at the project root (Vite expects this)
- Put all source code in `src/` (not at root level)
- Put static assets in `public/` (copied as-is during build)
- One component per file for component-based frameworks
- Group related files together, not by file type
