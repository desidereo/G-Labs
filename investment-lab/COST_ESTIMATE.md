# Cost estimate — G Labs Investment Lab (paper research)

Assumptions: ~22 weekday research runs/month, ~10–12 investable symbols, short AI synthesis per symbol when enabled.

| Item | Tier | Est. monthly |
|------|------|--------------|
| Yahoo Finance via `yahoo-finance2` | Unofficial / free | **$0** (rate limits; no SLA) |
| OpenAI-compatible (`gpt-4o-mini` class) | Pay-as-you-go | **~$1–5** if enabled; **$0** on demo synthesizer |
| Hosting (Vercel Hobby) | Free hobby | **$0** (cron available on Hobby with limits; verify after deploy) |
| DB — local `file:./data/*.db` | Free | **$0** |
| DB — Turso / libsql free tier | Free | **$0** within free quotas |
| Neon Postgres (optional later) | Free tier | **$0** within free quotas |
| Domain / cPanel parent site | Existing | unchanged |

**Notes**

- Soft cap via `MONTHLY_AI_BUDGET_USD` (default 10); `cost_events` table tracks token estimates.
- Demo mode never calls paid AI.
- Cloud cron is **not** claimed working until deployed and a weekday run is verified.
- Do not purchase paid market-data feeds for v0.
