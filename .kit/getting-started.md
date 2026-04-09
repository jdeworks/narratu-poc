# Getting started

Guided workflow for starting a new website project — from idea to working dev server.

## Step 1: Understand the project

Ask the user:
> "What do you want to build? Describe your website — what it does, who it's for, and any
> features you have in mind. Don't worry about technical details."

Wait for their response before continuing.

## Step 2: Determine the type

Figure out if the project needs a server or is purely static:

- **Static** — content doesn't change per user, no login, no database.
  Examples: portfolio, blog, landing page, docs site.
- **Server** — needs user accounts, saves data, talks to external APIs with secrets.
  Examples: dashboard, e-commerce, social app.

For beginners, explain it simply:
> "**Option A** is a website that shows information — like a digital poster. Everyone sees the
> same thing. **Option B** is a website where people can log in or save things — like Instagram.
> Based on what you described, I'd recommend Option [A/B] because [reason]."

Most beginner projects are static. When in doubt, start static — you can add a server later.

## Step 3: Set up the project

1. Scaffold the project using the quick-start command from AGENTS.md
2. Install dependencies
3. Start the dev server
4. Confirm the user sees the starter page in their browser

If this is their first time: "Your dev server is running — you just set up a real development
environment! The page in your browser will update automatically as we make changes."

### About node_modules

After `npm install`, a `node_modules` folder appears. It contains helper code your project needs:
- Don't edit files in there — npm manages them
- Don't worry about its size — that's normal
- It's not saved to Git — `.gitignore` skips it
- You can delete and recreate it with `npm install`

## Step 4: Initialize Git (optional)

```bash
git init
git add .
git commit -m "Initial commit from starter kit template"
```

If the user doesn't use Git, skip this entirely. They can add it later.

## Step 5: Record project decisions

Create a `project-config.md` to track choices:

```markdown
# Project Configuration

- **Project name:** {name}
- **Type:** static / server
- **Description:** {what the user described}
- **Framework:** vanilla / React / Astro / Next.js / other
- **Hosting:** GitHub Pages / Vercel / Railway / not decided
- **Needs auth:** yes / no
- **Needs database:** yes / no
```

This ensures later prompts know what was chosen without re-asking.

## Step 6: Next steps

Based on the project type, point to the right docs:

**For all projects:**
- `.kit/stack-choice.md` — decide on a framework (or confirm vanilla is right)
- `.kit/project-structure.md` — organize files
- `.kit/design-and-styling.md` — styling and accessibility
- `.kit/security.md` — security basics

**For static sites:**
- `.kit/hosting-static.md` — deploy to GitHub Pages, Vercel, or Netlify

**For server apps:**
- `.kit/hosting-server.md` — deploy with a server

**When they need more interactivity:**
- `.kit/react-upgrade.md` — upgrade from vanilla to React

**For CI/CD (requires Git):**
- `.kit/cicd.md` — automated testing and deployment

## Verify

- [ ] Dev server starts without errors
- [ ] Browser shows the starter page
- [ ] Tests pass (if tests exist)
- [ ] Git initialized with initial commit (if using Git)
- [ ] `project-config.md` created with user's choices
