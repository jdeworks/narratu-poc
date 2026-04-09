# Security essentials

Security checklist for every web project.

## Secrets management

- Store secrets in `.env` files, never in source code
- `.env` is in `.gitignore` — it's never committed
- Create `.env.example` with placeholder values (committed to git)
- Frontend vars with `VITE_` prefix are embedded in the build and visible to users — only use for public keys

```bash
# .env (never committed)
DATABASE_URL=postgres://...
API_SECRET=sk-...

# .env.example (committed)
DATABASE_URL=postgres://user:pass@localhost/mydb
API_SECRET=your-secret-here
```

## HTTPS

Always serve over HTTPS. All recommended hosting platforms (GitHub Pages, Vercel, Netlify,
Railway) provide HTTPS automatically.

## Input validation

- Never trust user input — validate on the server
- Sanitize all output to prevent XSS (use framework escaping, don't insert raw HTML)
- Use parameterized queries for database access — never concatenate user input into SQL

```javascript
// WRONG — SQL injection
db.prepare(`SELECT * FROM users WHERE id = ${userInput}`)

// RIGHT — parameterized
db.prepare('SELECT * FROM users WHERE id = ?').get(userInput)
```

## Dependencies

- Run `npm audit` regularly to check for known vulnerabilities
- Enable Dependabot on GitHub for automated dependency updates
- Review what you install — prefer well-maintained packages with few dependencies

## Authentication

Don't build authentication from scratch. Use a service:
- **Clerk** — full-featured, great DX
- **Auth0** — enterprise-ready
- **Supabase Auth** — if already using Supabase
- **NextAuth/Auth.js** — if using Next.js

## Server security (if applicable)

If your site has a server component, add these middleware:
- **helmet** — sets security headers
- **cors** — restricts cross-origin requests to known origins
- **express-rate-limit** — prevents abuse

```javascript
import helmet from 'helmet'
import cors from 'cors'
import rateLimit from 'express-rate-limit'

app.use(helmet())
app.use(cors({ origin: 'https://yourdomain.com' }))
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }))
```

## Pre-launch checklist

- [ ] No secrets in source code or git history
- [ ] `.env` is in `.gitignore`
- [ ] HTTPS enabled
- [ ] Input validated and output sanitized
- [ ] `npm audit` shows no critical vulnerabilities
- [ ] Authentication uses a trusted service (not hand-rolled)
- [ ] Rate limiting enabled (if server)
