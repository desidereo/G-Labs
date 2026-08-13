# Asian / London Sweep + 1‑Minute FVG Reversal EA (MT5)

An MT5 Expert Advisor that automates this workflow:

1. Mark the **Asian session** high/low and the **London session** high/low.
2. After the **New York open**, wait for one of those levels to be **swept** (a liquidity grab that pokes beyond the high or low).
3. Drop to the **1‑minute** chart and look for a **Fair Value Gap (FVG)** in the *reversal* direction:
   - a **high** was swept → look for a **bearish FVG** → go **short**
   - a **low** was swept → look for a **bullish FVG** → go **long**
4. Enter on the FVG, place the stop just beyond the sweep wick, and take profit at a configurable **Risk:Reward** (default **1:2**).

> ⚠️ This is a tool, not financial advice or a guarantee of profit. Test it thoroughly in the Strategy Tester and on a demo account before risking real money.

---

## Install

1. In MetaTrader 5: **File → Open Data Folder**.
2. Copy `AsianLondonSweepFVG.mq5` into `MQL5/Experts/`.
3. Open **MetaEditor** (F4), open the file, click **Compile** (F7). You should get `0 errors`.
4. Back in MT5, open the **Navigator → Expert Advisors**, and drag `AsianLondonSweepFVG` onto a chart.
5. Enable **Algo Trading** (the toolbar button) and allow automated trading in the EA dialog.

The EA reads price on the **M1 timeframe** internally, so you can attach it to any chart of the symbol you want to trade.

---

## ⏰ Time zone — now AUTOMATIC

By default the session inputs are entered in **New York time** and the EA converts them to your broker's server time for you, so you **don't** have to work out the offset manually.

Two inputs control this:

- `InpSessionTZ` – the time zone your session inputs are written in. Default **`TZ_NEWYORK`** (also `TZ_SERVER` or `TZ_GMT`).
- `InpBrokerScheme` – how the broker's server offset is determined:
  - **`SCHEME_ICM_AUTO23`** (default) – automatically uses **GMT+2 in winter / GMT+3 during US DST** (2nd Sun of March → 1st Sun of Nov). This matches **IC Markets** (and any "5 PM New York close" broker) and works correctly in the Strategy Tester too.
  - `SCHEME_FIXED` – use the fixed `InpBrokerGMTFixed` value.
  - `SCHEME_LIVE_AUTO` – detect the offset from the terminal live (falls back to the +2/+3 rule inside the tester).

> IC Markets is **GMT+2 (winter) / GMT+3 (summer)**. During the current month (August) it is **GMT+3**. With the defaults above you can just type the ICT windows in New York time and the EA handles the +2/+3 switch automatically across the year.

The on‑chart panel shows the detected broker offset (`broker GMT+2/+3`) and the session time zone so you can confirm it's correct.

| Window | Inputs | Meaning (in the selected time zone) |
|---|---|---|
| Asian session | `InpAsiaStart/End...` | Range that forms the Asia high/low (default 20:00–00:00 NY) |
| London session | `InpLondonStart/End...` | Range that forms the London high/low (default 02:00–05:00 NY) |
| NY hunt start | `InpNYStartHour/Min` | When to start watching for a sweep (default 09:00 NY) |
| NY hunt end / cutoff | `InpNYEndHour/Min` | Stop taking trades; optionally close open trade (default 12:00 NY) |

If you'd rather enter everything in broker server time as before, set `InpSessionTZ = TZ_SERVER`.

---

## Key inputs

**Strategy logic**
- `InpUseAsia` / `InpUseLondon` – which sessions' levels to watch.
- `InpSweepRef` – `SWEEP_OUTER` (only the outermost high/low across both sessions counts) or `SWEEP_EITHER` (the nearest level is enough).
- `InpEntryMode` – `ENTRY_MARKET_ON_FVG` (market order the moment a valid reversal FVG closes) or `ENTRY_LIMIT_AT_FVG` (pending limit inside the gap, filled on a retrace).
- `InpRR` – reward multiple. `2.0` = 1:2. Set `1.0` for 1:1.
- `InpSLBufferPts` – extra points beyond the sweep wick for the stop.
- `InpMinFVGPts` – ignore FVGs smaller than this (0 = off).
- `InpFVGEntryFrac` – for limit mode, how deep into the gap to place the entry (0 = near edge, 1 = far edge, 0.5 = middle).
- `InpMaxTradesDay` – trades allowed per day (default 1).

**Risk**
- `InpUseRiskPercent` + `InpRiskPercent` – size each trade to risk a % of balance to the stop (recommended).
- `InpFixedLot` – used instead when % risk is off.

**Trade management**
- `InpCloseAtCutoff` – close any open trade at the cutoff time.
- `InpMagic` – unique ID so the EA only manages its own trades.
- `InpSlippagePts` – max price deviation for market orders.

---

## How the logic runs (per day)

1. On the first M1 bar at/after **NY start**, the EA scans M1 history to compute the Asia and London high/low and draws them on the chart.
2. It then watches **closed M1 bars** for a sweep of the watched high (short bias) or low (long bias). No repainting — decisions use closed bars only.
3. After a sweep it tracks the grab's extreme (for the stop) and scans the last 3 closed M1 bars for a reversal FVG that formed **after** the sweep.
4. On a valid FVG it opens the trade with SL beyond the sweep and TP at `RR × risk`.
5. At the cutoff time it stops hunting and (optionally) closes the trade. Everything resets at the next server day.

---

## Python backtester

A standalone Python backtester lives in `mt5/backtest/backtest_sweep_fvg.py`. It pulls **real M1 data straight from your IC Markets terminal** (via the `MetaTrader5` package), replays the exact strategy with the same DST-aware +2/+3 timezone logic, and prints stats + saves an equity chart.

```powershell
cd mt5/backtest
pip install MetaTrader5 pandas numpy matplotlib   # once
python backtest_sweep_fvg.py --symbol EURUSD --days 40 --rr 2 --risk 1
python backtest_sweep_fvg.py --list               # see available symbols
```

Useful flags: `--from/--to YYYY-MM-DD`, `--rr`, `--risk`, `--balance`, `--sl-buffer`, `--min-fvg`, `--max-trades`, `--nearest`, `--no-compound`, `--spread`.

Extra modes:

- `--optimize` runs a parameter sweep (RR x sweep-ref x min-FVG x SL-buffer) and prints/saves a ranked table (`optimize_<symbol>.csv`).
- The fetcher auto-backfills M1 history in monthly chunks; if the terminal only holds a limited window it will tell you the earliest available bar.

> Note: the terminal only backtests the M1 history it has downloaded (scroll an M1 chart back / open Tools → History Center to pull more). The MT5 Strategy Tester (below) runs the actual compiled EA and is the source of truth.

## Running the real MT5 Strategy Tester

The compiled EA has been copied into the terminal's `MQL5/Experts` folder, and a ready config + input set are in `mt5/backtest/`:

- `tester_EURUSD.ini` – Strategy Tester config (symbol, period, dates, deposit)
- `AsianLondonSweepFVG_EURUSD.set` – input preset (also copied to `MQL5/Profiles/Tester/`)

**Easiest (GUI) – works while your terminal is open:**
1. In MT5 press **Ctrl+R** to open the Strategy Tester.
2. Expert = `AsianLondonSweepFVG`, Symbol = `EURUSD`, Period = `M1`.
3. Click **Load** and choose the `.set` preset, set the date range, Model = *1 minute OHLC* (or *Every tick based on real ticks*).
4. **Start**.

**Headless (command line):** MT5 allows only one instance per data folder, so you must **first close the running terminal**, then:

```powershell
& "C:\Program Files\MetaTrader 5 IC Markets (SC)\terminal64.exe" /config:"<repo>\mt5\backtest\tester_EURUSD.ini"
```

The config sets `ShutdownTerminal=1`, so the terminal runs the test, writes `AsianLondonSweepFVG_EURUSD_report.htm`, and closes.

## Backtesting tips

- In the Strategy Tester choose **Every tick based on real ticks** for realistic FVG/sweep fills.
- Test on the **M1** timeframe.
- First confirm on the panel that the Asia/London lines match what you'd draw manually — if they're off, your session times don't match the broker server time.
- Tune `InpSweepRef`, `InpEntryMode`, `InpRR`, and the session windows per symbol.

---

## Notes & limitations

- Best suited to indices / FX pairs that respect ICT session liquidity (e.g. NAS100, US30, XAUUSD, EURUSD). Results vary by symbol and broker.
- The FVG is the standard 3‑candle imbalance; it must appear after the sweep and in the reversal direction.
- One symbol per chart. Use a distinct `InpMagic` if you run it on several symbols.

---

# LondonORB.mq5 (August 2026 research)

A second EA in this folder implements the **London-open range breakout** rule
researched in `mt5/research/edge_research.md`: 03:00–08:00 London range, OCO
stop orders at the range extremes during 08:00–11:00, SL at the opposite side,
forced flat at 17:00 London, one trade/day, risk-percent sizing. All London-time
handling (UK DST) and the broker GMT+2/+3 offset (US DST) are automatic.

> **Validation verdict: NO-GO.** On 4 years of Dukascopy M1 across EURUSD,
> GBPUSD, USDJPY and XAUUSD the rule has a real *gross* edge that is fully
> consumed by realistic spread + commission + slippage: out-of-sample (2025)
> net expectancy is statistically zero. Full numbers, equity curves and
> caveats: `mt5/research/validation_report.md`. The EA is delivered as a
> faithful reference implementation — demo use only.
