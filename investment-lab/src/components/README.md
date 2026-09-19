# Investment Lab UI components

Views and shared widgets for the private paper-trading dashboard.

| Component | Role |
|-----------|------|
| `AppShell` | Sidebar nav, mobile menu, sign-out |
| `StatusBanners` | Paper-trading, demo, and stale-data banners |
| `MetricCard` | KPI tile |
| `CandidateTable` | Ranked research candidates |
| `ScoreBars` | Component score breakdown |
| `EvidenceList` | Thesis evidence claims |
| `PortfolioTable` | Holdings grid |
| `CashflowForm` | Deposit / withdrawal |
| `PerformanceCharts` | Recharts equity curves + metrics |
| `JobRunList` | Research job history |
| `RunResearchButton` | Manual `POST /api/research/run` |
| `EmptyState` / `LoadingState` / `ErrorState` | Polished async states |
| `api` / `useApiData` | BasePath-aware fetch helpers |
| `Providers` | Auth.js `SessionProvider` |

Pages live under `src/app/(lab)/` (Overview, Research, Portfolio, Performance, History, Automation, Settings) plus `src/app/login`.
