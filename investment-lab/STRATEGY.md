# Strategy notes — G Labs Investment Lab

**Version:** 0.1.0 (see `STRATEGY_VERSION` in code)

This is a **paper research lab**, not an advisory product and not a proven edge.

## Honest limitations

- Scores are **hypotheses** from transparent, deterministic formulas (momentum, volatility, simple fundamentals when present). They are not alpha claims.
- Missing PE / margins / expense ratios are marked missing — we do **not** invent fundamentals.
- Yahoo Finance is unofficial, rate-limited, and can be stale or incomplete for LSE tickers.
- AI text only **synthesises** schema-validated evidence claims; it does not set numerical ranks.
- UK retail availability varies by broker (ISA/SIPP lists, FX costs, OTC vs LSE). `brokerAvailable` is a coarse flag, not a guarantee you can buy the name tomorrow.
- US tickers (e.g. SPY) may be inconvenient or unavailable for UK investors; prefer UCITS wrappers (CSPX.L, VWRL.L, etc.).
- Past momentum is not future performance. Drawdowns will happen in paper and would in live markets.

## Benchmark

Primary benchmark: **VWRL.L** (Vanguard FTSE All-World UCITS). Fallbacks if Yahoo history fails: VWRA.L → URTH → ACWI. Cash-flow matching for performance comparison mirrors deposits into the benchmark portfolio.

## Actions

`buy` / `watch` / `hold` / `no_change` / `insufficient_evidence` come from coverage + score thresholds. Stale or thin data forces `insufficient_evidence` and withholds strong actions.

## Paper execution

Recommendations after the London evening run fill at the **next eligible session open**, never at the same-day prior close after hours.
