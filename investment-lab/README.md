# G Labs Investment Lab

Private paper-trading research application for **g-labs.software** (path `/investment-lab`).  
Research objective: measure whether a transparent, versioned ranking process can outperform an investable benchmark — **not** a promise of profits.

- Paper trading only — research **never** places real-money trades  
- Demo mode with fixtures when credentials are missing — never mixed into live records  
- Daily weekday research + weekly portfolio review defaults  

See also: `STRATEGY.md`, `COST_ESTIMATE.md`, `IMPLEMENTATION_PLAN.md`

## Architecture (why not only cPanel)

| Layer | Choice |
|-------|--------|
| Marketing site | Existing static HTML/PHP on Namecheap cPanel |
| Investment Lab | Next.js 16 (App Router) + TypeScript in this folder |
| Database | libSQL file locally; Turso/libSQL or Postgres URL in production |
| Auth | Auth.js credentials (private operator) |
| Jobs | DB-backed durable steps + Vercel Cron (`CRON_SECRET`) |
| Market data | Yahoo Finance adapter (`yahoo-finance2`) — free, unofficial |
| AI | OpenAI-compatible API (optional); schema-validated JSON |

cPanel shared hosting cannot run durable Node research workers. The Lab deploys **separately** (recommended: Vercel Hobby). `.cpanel.yml` copies only a README pointer into `/investment-lab` on the marketing host — not `node_modules`.

## Initial universe

US mega-caps (AAPL, MSFT, GOOGL, AMZN, NVDA) plus UK-retail-friendly UCITS ETFs (All-World / S&P / Nasdaq proxies). Benchmark: All-World UCITS proxy. `brokerAvailable` flags support UK broker restrictions. Details in `STRATEGY.md`.

## Local setup

**Requirements:** Node.js 20+ (22/24 fine), npm.

```bash
cd investment-lab
cp .env.example .env.local
# Leave AUTH_PASSWORD empty → DEMO_MODE + login demo/demo
npm install
npm run db:migrate
npm run research:run    # seed + demo pipeline
npm test
npm run dev
```

Open [http://localhost:3000/investment-lab](http://localhost:3000/investment-lab)  
Login: `demo` / `demo`

### Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Local Next.js |
| `npm run build` / `start` | Production build |
| `npm test` | Vitest (scoring, execution, TWR, jobs, schemas) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:migrate` | Ensure tables + seed |
| `npm run research:run` | Manual CLI research job |

## Deploy (your action — not done in this PR)

1. Create a Vercel project with **Root Directory** = `investment-lab`  
2. Set env vars from `.env.example` (`AUTH_SECRET`, `AUTH_PASSWORD`, `CRON_SECRET`, optional `OPENAI_API_KEY`, `LIBSQL_URL`)  
3. Optional: Turso free DB or Neon — file SQLite is fine for a single operator on one instance, fragile on serverless (prefer remote libSQL)  
4. Point `lab.g-labs.software` (or reverse-proxy `/investment-lab`) at Vercel  
5. Confirm one weekday cron in Vercel logs — **until then, cloud scheduling is unverified**

Cron expression in `vercel.json`: `30 21 * * 1-5` UTC ≈ 22:30 Europe/London in BST. The handler also checks the London weekday window (±30 minutes) and exchange calendar.

## Security

- Secrets only in server env — never commit `.env` / `.env.local`  
- Cron requires `Authorization: Bearer $CRON_SECRET`  
- Dashboard requires login  
- AI/web content treated as untrusted data; claims schema-validated  

## Recovery

- Failed runs leave the last **published** snapshot intact  
- Idempotency key `research:{date}:{timezone}` prevents duplicate publishes  
- `CATCH_UP_MISSED_RUNS=true` allows one catch-up for a missed weekday  
- Manual **Run research** on Automation page uses the same pipeline  

## Database backup

Local: copy `data/investment-lab.db`.  
Turso/Neon: use provider snapshots. Restore by replacing the DB URL / file and re-running migrate if needed.

## Your remaining checklist

1. Approve & merge this PR when ready (do not merge until you say so)  
2. Create Vercel project + set secrets (no paid plan required to start)  
3. Decide DB: Turso free vs Neon free vs local-only  
4. Add `OPENAI_API_KEY` when you want live AI synthesis (separate from ChatGPT/Cursor)  
5. Set strong `AUTH_PASSWORD` / `AUTH_SECRET` / `CRON_SECRET` before public DNS  
6. DNS: subdomain or reverse proxy from `g-labs.software` → Lab  
7. Observe one scheduled weekday run before trusting automation  
8. Confirm which UCITS tickers your UK broker can buy; flip `brokerAvailable` in Settings  

## Honest limits

Scores are relative ranks, not probabilities. Free Yahoo data can be stale or wrong — actionable buys are withheld when quality fails. AI news without point-in-time archives is forward-test only. See `STRATEGY.md` and `COST_ESTIMATE.md` (~$0–8/month at light usage on free tiers).
