# Hosting — server-rendered sites

How to deploy websites that need a server (API, database, SSR).

## Platform options

| Platform | Best for | Free tier |
|----------|----------|-----------|
| **Railway** | Quick deployment, databases included | $5/month credit |
| **Fly.io** | Global edge deployment | 3 shared VMs free |
| **Render** | Simple PaaS, auto-deploy from Git | Free tier (spins down) |
| **Docker + VPS** | Full control | Varies |

## Minimal server example (Express)

```javascript
import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import rateLimit from 'express-rate-limit'

const app = express()
const PORT = process.env.PORT || 3000

// Security middleware
app.use(helmet())
app.use(cors())
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }))
app.use(express.json())

// Serve static frontend
app.use(express.static('public'))

// API routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' })
})

app.listen(PORT, () => console.log(`Server running on port ${PORT}`))
```

## Database setup (SQLite example)

```javascript
import Database from 'better-sqlite3'

const DB_PATH = process.env.DB_PATH || './data/app.db'
const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')  // better concurrent read performance

// Always use parameterized queries
const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId)
```

## Railway deployment

1. Push your code to GitHub
2. Go to railway.app → New Project → Deploy from GitHub Repo
3. Set environment variables: `PORT`, `DB_PATH=/data/app.db`
4. **Critical:** If using SQLite, add a persistent volume mounted at `/data`
   (Settings → Volumes → Mount path: `/data`)
5. Railway auto-detects Node.js and deploys

### Gotchas

- **Persistent volume required** for SQLite — without it, data is lost on redeploy
- **Single instance only** with SQLite — for multi-instance, use Postgres
- **Always use parameterized queries** — see `.kit/security.md`

## Docker deployment

```dockerfile
FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
```

## Other server frameworks

The patterns above apply to any Node.js server framework. For non-JS stacks:
- **Python (Flask/FastAPI):** Deploy to Railway or Fly.io with a `Procfile` or Dockerfile
- **Go:** Build a static binary, deploy anywhere
- **Ruby (Rails):** Render and Railway have first-class Rails support

## Verify

- [ ] Server starts without errors
- [ ] API endpoints return correct responses
- [ ] Database persists across deploys (if applicable)
- [ ] Environment variables configured (not hardcoded)
- [ ] HTTPS working
