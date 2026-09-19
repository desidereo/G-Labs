# G Labs Investment Lab — Implementation Plan

Status: **ready for review** (branch `feature/investment-lab`) — not merged, not production-deployed.

## Findings from existing site

| Item | Reality |
|------|---------|
| Domain | `g-labs.software` (user also said glabs.software — live site is hyphenated) |
| Repo | `https://github.com/desidereo/G-Labs.git` |
| Stack | Static HTML + PHP proxies |
| Hosting | Namecheap cPanel via `.cpanel.yml` |
| Auth / DB / durable jobs | Not present on marketing host |

**Decision:** Keep marketing site on cPanel. Ship Lab as Next.js in `investment-lab/`, deploy separately (Vercel + libSQL/Turso). Link from main nav. No merge/public deploy without approval.

## Stages

1. [x] Inspect repo / hosting / create branch  
2. [x] Scaffold app, schema, auth, demo fixtures  
3. [x] Research pipeline + scoring + paper portfolio + performance  
4. [x] Dashboard views + automation UI  
5. [x] Tests, README, cost estimate, site nav, cPanel exclude  
6. [x] Push branch + open PR (awaiting your merge approval)  

## Verified locally

- `npm test` — 13 passed  
- `npm run build` — succeeded  
- Cloud cron — **not** verified (requires your Vercel deploy + weekday observation)
