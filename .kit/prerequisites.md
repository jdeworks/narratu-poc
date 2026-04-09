# Prerequisites

Setup checklist before starting a web project. Read this if you're new to web development.

## Experience level

Your experience level determines how much explanation you need:
- **Total beginner:** Never coded before. We'll explain everything.
- **Some experience:** Knows HTML/CSS basics. We'll focus on tooling setup.
- **Comfortable:** Has built projects before. Just verify tools are installed.

## Node.js (required)

Node.js runs JavaScript outside the browser. You need version 20 or newer.

**Check if installed:**
```bash
node --version
```

**Install if needed:**
- Download from https://nodejs.org (LTS version)
- Or use a version manager: `nvm install --lts` (recommended for managing multiple versions)

npm (the package manager) comes bundled with Node.js:
```bash
npm --version
```

## Code editor

Use any editor you're comfortable with. Recommendations:
- **VS Code** — free, excellent extension ecosystem
- **Cursor** — VS Code fork with built-in AI

Helpful extensions:
- Tailwind CSS IntelliSense (if using Tailwind)
- ESLint
- Prettier

## Git (optional but recommended)

Git tracks changes to your code. You don't need it to start, but you'll need it for deployment and collaboration.

**Check if installed:**
```bash
git --version
```

**Install if needed:**
- macOS: `xcode-select --install`
- Windows: Download from https://git-scm.com
- Linux: `sudo apt install git` (or your distro's package manager)

**First-time setup:**
```bash
git config --global user.name "Your Name"
git config --global user.email "your@email.com"
```

## GitHub (optional)

Needed for GitHub Pages hosting, CI/CD, and collaboration.

1. Create an account at https://github.com
2. For private repos or API access, create a personal access token:
   Settings → Developer settings → Personal access tokens → Generate new token

## Verify

- [ ] `node --version` shows v20 or newer
- [ ] `npm --version` shows a version number
- [ ] Code editor installed and working
- [ ] `git --version` works (if using Git)
- [ ] GitHub account created (if using GitHub)
