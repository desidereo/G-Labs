# Validation Report — Edge Research, August 2026

**Verdict up front: NO-GO.** None of the three pre-registered hypotheses cleared
the acceptance bar. The best candidate (London-open range breakout) has a real,
statistically detectable **gross** edge (pooled t = 2.98, 2,797 in-sample trades)
that is **fully consumed by realistic IC-Markets-Raw costs**: pooled
out-of-sample net expectancy in 2025 is **+0.0003 R (t = 0.01)** — indistinguishable
from zero. Deploying the delivered EA with real money is not recommended.

---

## 1. Methodology

- **Data**: Dukascopy M1 bid, 2022-01 → 2025-12, EURUSD / GBPUSD / USDJPY /
  XAUUSD (~1.5 M bars per symbol), converted to UTC; London wall clock derived
  with proper UK DST (last Sunday March/October).
- **Split**: In-sample (IS) 2022–2024 for all design decisions; 2025 held out
  and touched exactly **once**, after the configuration was frozen.
- **Costs** (round-trip, spread + $7/lot commission + slippage):
  EURUSD/GBPUSD 1.0 pip (2.3 pips off-hours), USDJPY 1.3 pips (2.8 off-hours),
  XAUUSD $0.25/oz ($0.60 off-hours). Both gross and net reported everywhere.
- **Anti-overfitting**: hypotheses, windows, grids and the GO/NO-GO bar were
  pre-registered in `edge_research.md` **before** any test ran. Total
  configurations examined: 3 parameter-free event studies + 4 trade-rule cells
  (H3 grid) + 8 sensitivity variants around the frozen cell. No selective
  re-runs; the killed hypotheses were not revisited.
- **GO bar (fixed up front)**: positive net OOS expectancy on ≥ 3 of 4 symbols,
  net PF ≥ 1.2 OOS, stability across a parameter neighbourhood.

## 2. Hypothesis outcomes

### H1 — London 4 pm fix reversal: **KILLED at the gross event-study gate**

Fade PnL (ATR units) of the post-fix 30-minute window, conditioned on the
pre-fix 40-minute move, IS 2022–2024 (~760 days/symbol):

| Symbol | Largest bucket (>0.20 ATR pre-fix move) | t | Direction |
|---|---|---|---|
| EURUSD | +0.0215 | +1.96 | weak reversal |
| GBPUSD | +0.0140 | +1.07 | insignificant |
| USDJPY | −0.0184 | −0.95 | **continuation** |
| XAUUSD | −0.0226 (−0.0329 @15 m, t = −3.03) | −1.77 | **continuation** |

Effect present on at most 1 of 4 symbols; month-end subsample also flat.
Pre-registered kill criterion met (needed ≥ 3 symbols).

### H2 — Quiet-hours mean reversion (21:00–06:00 UTC z-score fade): **KILLED on costs + data artifact**

The gross effect is real and strong — but only on the **buy** side (fading
downward spikes): t-stats +2.3 to +7.7 across all four symbols at z* = 1.5–2.5.
The sell side is flat to negative. Two fatal problems:

1. **Net of off-hours costs, every one of the 24 cells is negative.** Best cell
   (GBPUSD z ≥ 1.5, 60 m hold): gross ≈ +2.1 pips vs ≈ 2.3 pips cost → −0.1 pip.
2. The buy-only asymmetry is the signature of a **bid-quote artifact**: this is
   bid data, and overnight spread widening mechanically depresses the bid.
   Part of the measured "reversion" is the spread normalising — which a real
   order (buying at the ask) cannot capture. The true tradable effect is even
   smaller than measured.

Pre-registered kill criterion met (gross < 1.5× off-hours cost everywhere).

### H3 — London-open range breakout: **survived IS gates, FAILED OOS**

Rule: range = 03:00–08:00 London high/low; first break during 08:00–11:00
enters with the break (stop order at the level); SL = opposite side of the
range (risk = 1 range); exit at 17:00 London. One trade/day. No other filters.

**IS grid (2022–2024, net)** — the pre-registered 2×2 (range window × exit type).
TP-at-1R variants were flat/negative everywhere; time-exit variants positive on
all four symbols. Frozen cell: **03–08 / time-exit** (before looking at 2025):

| Symbol | n | win% | avgR gross | avgR net | PF gross | PF net | t (net) | maxDD |
|---|---|---|---|---|---|---|---|---|
| EURUSD | 742 | 41.8 | +0.090 | +0.038 | 1.17 | 1.07 | 0.70 | 36 R |
| GBPUSD | 744 | 40.2 | +0.090 | +0.053 | 1.17 | 1.10 | 0.93 | 28 R |
| USDJPY | 654 | 45.1 | +0.091 | +0.053 | 1.20 | 1.11 | 1.00 | 34 R |
| XAUUSD | 657 | 39.0 | +0.056 | +0.019 | 1.11 | 1.03 | 0.34 | 32 R |
| **Pooled** | **2797** | — | **+0.082 (t = 2.98)** | **+0.041 (t = 1.49)** | — | — | — | — |

**Parameter sensitivity (IS, net avgR, pooled)**: every neighbouring setting
stayed positive (+0.027 to +0.057) — range 02/03/04–08, hunt end 10/11/12,
exit 16/17/18. So the IS result is not a lucky parameter point. But at 1.5×
costs the pooled edge halves (+0.020) and at 2× costs it is gone (−0.000):
the entire margin is cost-sized.

**Year-by-year (net avgR)** — the warning sign before OOS:

| Symbol | 2022 | 2023 | 2024 |
|---|---|---|---|
| EURUSD | +0.124 | +0.100 | **−0.107** |
| GBPUSD | +0.120 | +0.004 | +0.033 |
| USDJPY | +0.222 | **−0.098** | +0.043 |
| XAUUSD | +0.105 | **−0.024** | **−0.029** |

Most of the IS profit comes from 2022 — the exceptional high-volatility
trending year (Fed hiking cycle, EURUSD below parity, GBP crisis). 2023–2024
are ~flat.

**Out-of-sample 2025 (frozen config, run once)**:

| Symbol | n | avgR gross | avgR net | PF net |
|---|---|---|---|---|
| EURUSD | 234 | +0.035 | −0.010 | 0.98 |
| GBPUSD | 244 | +0.104 | +0.067 | 1.13 |
| USDJPY | 204 | +0.003 | −0.027 | 0.94 |
| XAUUSD | 198 | −0.027 | −0.042 | 0.91 |
| **Pooled** | **880** | **+0.033 (t = 0.77)** | **+0.0003 (t = 0.01)** | ≈ 1.00 |

Against the GO bar: net-positive on **1**/4 symbols (needed ≥ 3); best net PF
1.13 (needed ≥ 1.2). **Fail.**

Equity curves (gross grey, net blue):

- In-sample 2022–2024: `mt5/backtest/orb_equity_IS2022_2024.png`
- Out-of-sample 2025: `mt5/backtest/orb_equity_OOS2025.png`

Per-trade CSVs: `mt5/backtest/orb_<SYMBOL>_IS2022_2024_trades.csv` and
`orb_<SYMBOL>_OOS2025_trades.csv`.

## 3. GO/NO-GO verdict

**NO-GO — high confidence.**

- The London ORB gross effect is genuine (pooled IS t ≈ 3 on ~2,800 trades,
  consistent sign on 4 symbols and across parameter neighbourhoods; consistent
  with the opening-range-breakout literature). It is not noise.
- But its magnitude (~0.08 R gross ≈ 4–8 pips/trade equivalent) sits almost
  exactly at retail round-trip cost. What remains net is statistically zero
  out-of-sample, and the profitable years are exactly the high-volatility
  regime (2022) — you would be making a volatility-regime bet, not harvesting
  a persistent edge.
- H1 and H2 failed earlier gates (H1: effect absent/reversed on 3 of 4 symbols;
  H2: real gross anomaly, but sub-cost and partially a bid-quote artifact).

**Caveats / what could change the picture:**

- Costs are the binding constraint, not signal. An execution setup with
  materially lower costs (institutional spreads/rebates, or a cost model half
  of ours) would make the ORB net-positive — pooled net at 0.5× costs would be
  ≈ +0.06 R. This is an edge for someone else, not for a retail MT5 account.
- A volatility-regime filter (trade only when realized vol is high) is the
  obvious next research question, but it was NOT pre-registered; designing it
  now on the same data would be exactly the overfitting this project set out
  to avoid. It would need a fresh pre-registration and new OOS data (2026+).
- Slippage on stop entries at the London open could be worse than modelled;
  that would only deepen the NO-GO.

## 4. Deliverables and how to run them

| File | Purpose |
|---|---|
| `mt5/research/edge_research.md` | Pre-registered hypotheses, rationale, tests, GO bar |
| `mt5/research/validation_report.md` | This report |
| `mt5/backtest/fetch_duka.py` | Download Dukascopy M1 into `duka_cache/` |
| `mt5/backtest/edge_lab.py` | Event studies for H1/H2/H3 |
| `mt5/backtest/backtest_orb.py` | ORB trade-rule backtester (grid / years / sensitivity / OOS) |
| `mt5/Experts/LondonORB.mq5` (+ `.ex5`) | MQL5 EA mirroring the frozen rule; compiles 0 err / 0 warn; also copied to the terminal's `MQL5\Experts` |

```powershell
cd C:\Users\Windows10\Desktop\TechLocal_Grant_Application\Websites\G_Labs\mt5\backtest

# data (cached; re-run only to add symbols/years)
python fetch_duka.py --symbols GBPUSD USDJPY --from 2022 --to 2025

# event studies (in-sample window)
python edge_lab.py --study fix   --from 2022 --to 2024
python edge_lab.py --study night --from 2022 --to 2024
python edge_lab.py --study orb   --from 2022 --to 2024

# ORB backtests
python backtest_orb.py --grid        --from 2022 --to 2024   # pre-registered 2x2
python backtest_orb.py --years       --from 2022 --to 2024   # per-year stability
python backtest_orb.py --sensitivity --from 2022 --to 2024   # neighbourhood
python backtest_orb.py --from 2025 --to 2025 --png --tag OOS2025  # frozen OOS
```

The EA (`LondonORB`) is deployed to the IC Markets terminal. If you attach it
regardless of the verdict, use a demo account; inputs default to the frozen
research configuration (03–08 London range, hunt to 11:00, exit 17:00,
0.5 % risk).

---

## Addendum 2026-08-13 - H3b volatility-regime filter (fresh 2026 OOS)

Pre-registered in `edge_research.md` BEFORE any 2026 data was downloaded.
Filter: trade only if today's 03-08 range >= mult x trailing 20-day median
range. Test data: 2026-01 -> 2026-08 Dukascopy M1 (never previously used).

**Fresh 2026 results (net, IC-Raw costs):**

| Variant | n | pooled avgR | t | net-positive symbols |
|---|---|---|---|---|
| baseline (no filter) | 534 | -0.039 | -0.73 | 2/4 |
| **PRIMARY med x1.00** | 191 | **+0.072** | 0.93 | **3/4 - bar met** |
| med x0.75 | 325 | +0.000 | 0.01 | 3/4 |
| med x1.25 | 111 | +0.143 | 1.43 | 4/4 |
| cost/range <= 0.05 | 355 | -0.009 | -0.16 | 2/4 |

Context (2022-2025, CONTAMINATED - base rule designed on this data):
baseline +0.031, primary +0.020, x1.25 +0.002. Filter roughly halves max
drawdown in both periods (e.g. USDJPY 36.7R -> 9.1R).

**Verdict: CAUTIOUS PASS.** The primary filter met its pre-registered bar
(pooled net > 0, 3/4 symbols) on genuinely fresh data, and was net-positive in
both periods while the unfiltered rule flipped negative in 2026. But t = 0.93
on 191 trades is NOT statistical significance, and the sensitivity ordering
changed between periods (x1.25 worst in 2022-25, best in 2026). Treat as a
defensible risk-reduction feature with a plausible small edge - not proof of
profitability. Ship in the Pro EA default-ON; demo-forward-test before any
real money.

Implementation: `backtest_orb.py --volfilter` reproduces these tables;
`mt5/Experts/LondonORBPro.mq5` is the production EA (vol filter + daily-loss
halt + max-drawdown halt + dashboard), compiled 0 errors / 0 warnings and
deployed to the terminal.
