# London ORB Pro

A fully automated London-session opening-range breakout EA for MetaTrader 5,
with a volatility-regime filter and a prop-firm-grade risk suite. Trades once
per day, intraday only, always flat by 17:00 London. No martingale, no grid,
no averaging-down — every trade has a hard stop from the moment it opens.

## How it trades

1. **Range** — builds the 03:00–08:00 London opening range (all session times
   are London wall clock; UK/US daylight saving handled automatically, works
   on GMT+2/+3 brokers like IC Markets out of the box or any broker via a
   fixed-offset setting).
2. **Volatility filter** — compares today's range to the median of the last
   20 days. Small, listless ranges are skipped: breakouts from them are noise
   and transaction costs eat the move. Only larger-than-usual ranges trade.
3. **Breakout** — from 08:00 London an OCO pair of stop orders sits at the
   range high (buy) and range low (sell). First side hit wins; the other is
   cancelled. Unfilled orders expire at 11:00.
4. **Exit** — stop-loss at the opposite side of the range (risk = exactly one
   range); position closed at 17:00 London. One trade per day, maximum.

## Feature list

| Feature | Detail |
|---|---|
| Volatility-regime filter | Trailing-median range gate, lookback and multiplier configurable |
| Position sizing | Percent-of-balance risk (default 0.5%) or fixed lot |
| Daily loss limit | Halts trading for the day at −X% equity (prop-firm daily drawdown) |
| Max drawdown halt | Stops the EA entirely at −X% below peak equity (persists across restarts) |
| Spread guard | Skips order placement when spread exceeds a limit |
| Range size guards | Optional min/max range in points (e.g. skip crazy news days) |
| Trading-day selector | Enable/disable each weekday individually |
| Optional exits | TP at N×range, break-even, R-based trailing (all off by default — off = the researched rule) |
| Dashboard | On-chart panel: range, filter verdict, state, equity/day P/L, halt status |
| Broker timezone | Auto GMT+2/+3 (NY-close brokers) or fixed manual offset |

## Recommended settings

Defaults are the researched configuration: range 03–08, breakout window to
11:00, exit 17:00, vol filter ON (20-day median × 1.0), 0.5% risk. Symbols
researched: EURUSD, GBPUSD, USDJPY, XAUUSD — attach to one chart per symbol
(any chart timeframe; the EA uses M1 data internally). For prop-firm accounts
set the daily loss limit ~1% below your firm's rule (e.g. 4% for a 5% rule)
and the max drawdown halt likewise.

The EA needs ~20 weekdays of M1 history for the filter median; on a fresh
chart it will trade unfiltered (with a log warning) until history is present —
open the M1 chart once to force a history download.

## Honest performance statement (read before buying/selling this)

This EA was built with pre-registered hypotheses, four years of external
Dukascopy M1 data, realistic spread+commission+slippage costs, and untouched
out-of-sample periods (full methodology: `mt5/research/validation_report.md`).

- The breakout effect is real **gross**: +0.08 R/trade, t = 2.98 across 2,797
  trades, 2022–2024, four symbols.
- Retail costs consume most of it. Unfiltered, 2026 out-of-sample was net
  negative.
- The volatility filter was pre-registered and then tested **once** on fresh
  2026 data: pooled **+0.072 R/trade net**, positive on 3 of 4 symbols
  (191 trades, t = 0.93). Positive in both test periods, and it roughly
  halves the strategy's drawdown.

That is an encouraging, methodologically clean result — and it is **not**
statistical proof of profitability. Nobody can honestly promise that. Forward
test on demo before real money, and never market this EA with guaranteed
returns: what it credibly offers is a transparent, researched rule, strict
risk control, and safety features most retail EAs lack.

## Files

- `LondonORBPro.mq5` / `.ex5` — the EA (compiles 0 errors / 0 warnings)
- Research: `mt5/research/edge_research.md` (pre-registrations),
  `mt5/research/validation_report.md` (all results incl. the 2026 addendum)
- Backtester: `mt5/backtest/backtest_orb.py` (`--volfilter` reproduces the
  filter tables)
