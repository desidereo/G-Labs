# Edge Research — Candidate Hypotheses and Pre-Registered Tests

*G Labs quant research, August 2026.*
*Written BEFORE running any of the tests below (pre-registration). Amendments after
the fact are marked as such in the validation report, never silently edited here.*

## 0. Ground rules (from prior failures in this repo)

The Asian/London sweep + FVG project taught us:

- A 3-month, 30–60-trade sample can make a worthless filter look brilliant
  (RSI filter: PF 2.5 on 3 months → worst-performing config on 4 years of gold).
- The base strategy was ~breakeven gross and certainly negative net.

Therefore every test below is defined **before** running it, with:

- **Data**: Dukascopy M1, 2022-01 → 2025-12, four symbols: EURUSD, GBPUSD,
  USDJPY, XAUUSD. Bid prices; costs modelled separately.
- **Split**: In-sample (IS) = 2022–2024. Out-of-sample (OOS) = 2025, untouched
  until the design is frozen. Additionally a walk-forward check (yearly folds).
- **Costs** (IC Markets Raw, round-trip, per side halved at entry/exit):
  - EURUSD/GBPUSD: raw spread ≈ 0.2 pip liquid hours / ≈ 1.5 pips 17:00–18:00 NY
    rollover window; commission $7 per lot RT ≈ 0.7 pip; slippage 0.1 pip
    ⇒ ≈ 1.0 pip RT liquid, ≈ 2.3 pips RT in the rollover hour.
  - USDJPY: same spread profile in pips; commission $7 RT ≈ 1.0 pip at ~145 ⇒ ≈ 1.3 pips RT liquid.
  - XAUUSD: raw spread ≈ $0.12/oz liquid (wider off-hours ≈ $0.40), commission
    $7 RT on 100 oz ≈ $0.07 ⇒ ≈ $0.25 RT liquid.
- **Decision bar (GO/NO-GO), fixed up front**: positive **net** OOS expectancy
  on ≥ 3 of 4 symbols, net PF ≥ 1.2 OOS, effect stable across a neighbourhood of
  parameters (not one lucky cell), and IS/OOS behaviour consistent. Anything
  less is NO-GO, reported as such.
- **Honesty note**: the realistic prior for retail M1 edges after ~1 pip RT
  costs is *negative*. We expect most or all hypotheses to fail; the goal is to
  find out cleanly, and only ship something that survives.

## 1. Candidate edge survey

| # | Candidate | Documented rationale | Who loses / why it might persist | Testable on M1? | Verdict |
|---|-----------|---------------------|----------------------------------|-----------------|---------|
| 1 | **London 4pm fix reversal** | WM/Reuters fix attracts huge passive rebalancing flow executed mechanically into 16:00 London; price is pushed away from equilibrium and partially reverts after (Evans 2018; Melvin & Prins 2015; the 2013–14 fix-manipulation scandal is direct evidence the flow moves price) | Passive funds MUST trade at the fix regardless of price (tracking-error minimisation). They systematically pay for immediacy; liquidity providers who warehouse the inventory earn the reversion | Yes — event study on minute bars around the fix | **TEST (H1)** |
| 2 | **Quiet-hours mean reversion** (fade z-score extremes 21:00–06:00 UTC) | Thin-liquidity overshoot: order-flow shocks in the Asian session move price more per unit volume; reversion when liquidity returns. Well-documented negative short-horizon autocorrelation in FX off-hours | Uninformed/impatient flow trading when the book is thin pays the overshoot; MM inventory effects | Yes | **TEST (H2)** |
| 3 | **London-open range breakout** (momentum complement of #2) | Concentration of informed flow + stop cascades at the LSE/European open; overnight information gets impounded in a directional burst | Late reactors and mean-reversion traders fading real information flow | Yes | **TEST (H3)** — cheap to run with the same harness; also serves as a regime sanity-check on H2 (both can't work in the same window/direction) |
| 4 | Day-of-week / turn-of-month FX seasonality | Some evidence (e.g. month-end rebalancing), but effect sizes are a few bps/day | — | Yes but ~48 events/yr/symbol → sample too small for M1 execution validation | Skip |
| 5 | Breedon–Ranaldo domestic-hours depreciation | Documented, but magnitude ~1–2 bp/day, far below retail costs | — | Yes | Skip (cost-dominated by construction) |
| 6 | News momentum (NFP/CPI bursts) | Real, but requires tick data, an economic calendar, and execution guarantees a retail EA doesn't have; slippage modelling would be guesswork | — | Not honestly | Skip |
| 7 | Another liquidity-sweep / FVG variant | Already falsified in this repo at scale | — | — | Skip |

## 2. Pre-registered hypotheses and falsifiable tests

### H1 — London-fix reversal

**Hypothesis.** Let `move = close(fix) − close(fix − 40 min)` (the pre-fix drift).
Post-fix return `ret = close(fix + 30 min) − close(fix)` is negatively related to
`move`: E[ret · sign(move)] < 0, and the effect is large enough to clear ~1 pip RT
costs when conditioned on large |move|.

**Exact test.**
1. Event study on IS (2022–2024), all four symbols. Fix time = 16:00 London,
   converted with proper **UK** DST (last Sunday Mar/Oct) — *not* US DST.
2. Bucket days by pre-fix move normalised by 20-day ATR. For each bucket report
   mean and t-stat of the fade PnL (in price and in ATR units), gross.
3. If gross effect in the top-|move| buckets is ≥ 2× estimated RT cost with
   |t| ≥ 2, build the trading rule: enter at fix close against the move when
   |move| ≥ k·ATR, exit at fix+30m (time stop) with a disaster SL; grid k ∈
   {0.05, 0.10, 0.15} × exit ∈ {15, 30, 60} min only.
4. Separately report month-end days (documented strongest flow).

**Kill criteria.** Gross bucket effect ≈ 0 or positive (continuation), or effect
present in fewer than 3 symbols, or net IS expectancy < 0 for every cell.

### H2 — Quiet-hours mean reversion

**Hypothesis.** During 21:00–06:00 UTC, when M1 close deviates from its rolling
240-min mean by ≥ z standard deviations (σ of the same 240-min window), price
reverts: fading the deviation with exit at the mean or a 120-min time stop has
positive gross expectancy that survives costs (using off-hours spread!).

**Exact test.**
1. Conditional-return study on IS: at each bar in the window with |z| ≥ {1.5,
   2.0, 2.5}, record forward return to mean-touch / +30m / +60m / +120m, signed
   against the deviation. Report mean, t-stat (with overlapping-sample
   correction: cluster by day), gross and net of off-hours costs.
2. If promising, trade rule: one position at a time, enter on first |z| ≥ z*
   crossing per night per direction, SL at entry ± 2×(240-min σ), exit at mean
   touch or 06:00 UTC. Grid z* ∈ {1.5, 2.0, 2.5} × SL mult ∈ {1.5, 2, 3} only.

**Kill criteria.** Gross expectancy < 1.5× off-hours RT cost, or sign flips
across symbols/years.

### H3 — London-open range breakout

**Hypothesis.** The high/low of the 03:00–08:00 London-time window, broken
during 08:00–11:00 London, continues: buying the upside break (selling
downside) with SL at the opposite side of the range and a 17:00-London time
exit has positive expectancy. (Documented as "opening range breakout"; in FX
the London open is *the* information-arrival session.)

**Exact test.**
1. IS event study: distribution of MFE/MAE after first breakout; fraction of
   days the break continues ≥ 0.5× range vs reverses to the other side.
2. Trade rule grid: range window ∈ {03–08, 00–08} London × target ∈ {1R at
   opposite-side SL, time-exit-only} — 4 cells/symbol, no more.

**Kill criteria.** Net IS expectancy < 0 on 3+ symbols (this is expected — ORB
in FX is widely reported ~breakeven after costs post-2010; we test it because
the harness makes it nearly free and it disciplines H2's interpretation).

## 3. Multiple-comparisons bookkeeping

Total pre-registered configurations across all hypotheses: H1 ≤ 9, H2 ≤ 9,
H3 ≤ 4 per symbol — ≤ 22 trading-rule cells per symbol, plus the parameter-free
event studies that gate them. Any config count beyond this will be disclosed in
the validation report. With ~750–1000 events/symbol/hypothesis on IS and 4
symbols, a real edge should show |t| ≥ 2 consistently, not in one cell.

## 4. Chosen order of work

1. Run the three **gross event studies** on IS first (no parameters to fit).
2. Kill anything that fails its gate; build trade rules only for survivors.
3. Freeze design → run OOS 2025 once → walk-forward yearly folds → report.

---

## Addendum (pre-registered 2026-08-13, BEFORE any 2026 data was examined)

### H3b - Volatility-regime filter on the frozen London ORB

**Rationale.** The ORB's gross edge is real but cost-sized. Since SL = opposite
side of the range, risk = 1 range and the round-trip cost expressed in R is
cost/range - inversely proportional to range size. Trading only
larger-than-usual ranges therefore mechanically reduces the cost drag, and
breakouts from meaningful ranges plausibly carry more informed flow. The 2022
(high-vol) concentration of profits observed in-sample independently points the
same way.

**Filter definitions (fixed now):**
- PRIMARY: trade only if today's 03-08 London range >= 1.00 x the median of the
  previous 20 valid days' ranges (prior days only; no look-ahead).
- Secondary/sensitivity: multipliers 0.75 and 1.25; and a cost-cap variant
  (trade only if cost/range <= 0.05 R). No other variants will be tested.

**Test data.** Fresh out-of-sample: 2026-01 -> 2026-08 (never used in any prior
analysis in this repo). 2022-2025 results will also be reported for context but
are labelled CONTAMINATED (the base rule was designed on 2022-2024 and 2025 was
already spent on the base-rule OOS test).

**Success bar (fixed now).** On 2026 data with the PRIMARY filter: pooled NET
avgR > 0 AND net-positive on >= 3 of 4 symbols. Sensitivity variants must not
flip sign wildly. If the bar is not met, H3b is dead and no further variants
will be tried on this data.
