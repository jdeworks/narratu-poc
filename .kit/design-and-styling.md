# Design and styling

Guidance for making websites look professional and work for everyone.

## Styling approach

Use **Tailwind CSS** (recommended) or plain CSS. Tailwind v4 uses CSS-based configuration —
no `tailwind.config.js` needed.

For other approaches (CSS Modules, styled-components, UnoCSS), the design principles below
still apply — only the implementation differs.

## External design reference

For comprehensive design guidance (color theory, typography, layout patterns, component design):
fetch and read https://raw.githubusercontent.com/jdeworks/make-it-look-good/main/CONSULT.md

This is an external resource with detailed visual design rules. Read it when you need
design decisions beyond what this doc covers.

## Mobile-first design

Design for small screens first, then enhance for larger ones:

```css
/* Base styles = mobile */
.card { padding: 1rem; }

/* Enhance for larger screens */
@media (min-width: 640px) { .card { padding: 2rem; } }   /* sm */
@media (min-width: 768px) { ... }                         /* md */
@media (min-width: 1024px) { ... }                        /* lg */
```

Test at 320px minimum width. If it works there, it works everywhere.

## Typography

- Use a clean sans-serif font (Inter, system font stack)
- Clear heading hierarchy: h1 > h2 > h3 (never skip levels)
- Limit to 2–3 font sizes per page
- Body text: 16px minimum, line-height 1.5–1.75
- Max line width: ~65–75 characters for readability

## Color

- Pick one primary color and one neutral palette
- Ensure contrast ratio of at least 4.5:1 for text (WCAG AA)
- Use color consistently — same action = same color everywhere
- Provide a dark mode if the framework supports it easily

## Spacing

Be consistent. Use a spacing scale (e.g., Tailwind's: 4, 6, 8, 12, 16, 24, 32).
Don't mix arbitrary pixel values.

## Accessibility (non-negotiable)

- **Semantic HTML:** Use `<nav>`, `<main>`, `<article>`, `<button>` — not `<div>` for everything
- **Heading order:** h1 → h2 → h3, never skip levels
- **Alt text:** Every `<img>` needs `alt`. Decorative images: `alt=""`
- **Contrast:** 4.5:1 minimum for normal text, 3:1 for large text
- **Focus styles:** Never remove `outline` without replacement. Keyboard users need visible focus.
- **Labels:** Every form input needs a `<label>` (or `aria-label`)

## Images

- Use modern formats: WebP or AVIF (with fallbacks)
- Always set `width` and `height` attributes to prevent layout shift
- Lazy-load images below the fold: `loading="lazy"`
- Keep images in `public/` — they're copied as-is during build

## Contact forms

Don't build a backend just for a contact form. Use:

- **Formspree** — free tier, easy setup
- **Netlify Forms** — if hosting on Netlify
- **mailto: link** — simplest option for basic contact
