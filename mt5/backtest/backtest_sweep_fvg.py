"""
Backtester for the Asian/London Sweep + 1-minute FVG reversal strategy.

It mirrors the MT5 EA (mt5/Experts/AsianLondonSweepFVG.mq5):

  1. Mark the Asian session high/low and London session high/low.
  2. After the New York open, wait for one of those levels to be swept.
  3. On the M1 chart, look for a Fair Value Gap in the reversal direction
     (high swept -> bearish FVG -> short ; low swept -> bullish FVG -> long).
  4. Enter on the FVG, stop beyond the sweep wick, target RR (default 1:2).

Data is pulled straight from your MetaTrader 5 terminal (IC Markets) via the
official `MetaTrader5` Python package, so bar times are already in BROKER
SERVER time. Session inputs are given in New York time and converted to server
time with the same DST-aware +2/+3 logic as the EA.

Usage (PowerShell):
    python backtest_sweep_fvg.py --symbol EURUSD --days 120
    python backtest_sweep_fvg.py --symbol US100 --from 2026-05-01 --to 2026-08-01 --rr 2 --risk 1

Run `python backtest_sweep_fvg.py --list` to print available symbols.
"""

from __future__ import annotations

import argparse
import copy
import sys
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

import numpy as np
import pandas as pd

try:
    import MetaTrader5 as mt5
except Exception as exc:  # pragma: no cover
    print("ERROR: the MetaTrader5 package is required. Install with: pip install MetaTrader5")
    raise

# ----------------------------------------------------------------------------
# Strategy configuration
# ----------------------------------------------------------------------------


@dataclass
class Config:
    symbol: str = "EURUSD"
    date_from: datetime = None
    date_to: datetime = None

    # session windows in NEW YORK time (24h) -- must match the EA inputs
    asia_start: tuple = (20, 0)
    asia_end: tuple = (0, 0)      # midnight
    london_start: tuple = (2, 0)
    london_end: tuple = (5, 0)
    ny_start: tuple = (9, 0)
    ny_end: tuple = (12, 0)

    use_asia: bool = True
    use_london: bool = True
    sweep_outer: bool = True      # True = outer (max high/min low); False = nearest

    # higher-timeframe daily bias: "none", "prev1" (yesterday's candle),
    # "prev2" (last two daily candles must agree, else skip the day)
    bias_mode: str = "none"

    # RSI confirmation filter (oversold for longs / overbought for shorts)
    use_rsi: bool = False
    rsi_tf: int = 5           # RSI timeframe in minutes
    rsi_period: int = 14
    rsi_os: float = 30.0      # oversold threshold (longs)
    rsi_ob: float = 70.0      # overbought threshold (shorts)

    rr: float = 2.0
    sl_buffer_points: int = 20
    min_fvg_points: int = 0
    max_trades_per_day: int = 1
    close_at_cutoff: bool = True

    spread_points: float = 0.0    # optional cost applied to entry/exit

    # money model
    start_balance: float = 10_000.0
    risk_percent: float = 1.0
    compounding: bool = True

    point: float = field(default=0.0, init=False)


# ----------------------------------------------------------------------------
# Time zone helpers (mirror the EA)
# ----------------------------------------------------------------------------


def nth_sunday(year: int, month: int, n: int) -> datetime:
    d = datetime(year, month, 1)
    first_sunday = 1 + ((6 - d.weekday()) % 7)  # Monday=0..Sunday=6
    return datetime(year, month, first_sunday + (n - 1) * 7)


def is_us_dst(dt: datetime) -> bool:
    start = nth_sunday(dt.year, 3, 2) + timedelta(hours=2)
    end = nth_sunday(dt.year, 11, 1) + timedelta(hours=2)
    return start <= dt < end


def broker_offset(server_dt: datetime) -> int:
    """IC Markets scheme: GMT+2 winter, GMT+3 during US DST."""
    return 3 if is_us_dst(server_dt) else 2


def ny_offset(server_dt: datetime) -> int:
    boff = broker_offset(server_dt)
    gmt_approx = server_dt - timedelta(hours=boff)
    return -4 if is_us_dst(gmt_approx) else -5


def ny_to_server(ref_server: datetime, h: int, m: int) -> datetime:
    """Convert a New York wall-clock time on ref's NY-day to broker server time."""
    boff = broker_offset(ref_server)
    shift = boff - ny_offset(ref_server)           # = 7 for IC Markets
    ref_input = ref_server - timedelta(hours=shift)
    target_input = ref_input.replace(hour=h, minute=m, second=0, microsecond=0)
    return target_input + timedelta(hours=shift)


def session_bounds(ref_server: datetime, start_hm, end_hm):
    start = ny_to_server(ref_server, *start_hm)
    end = ny_to_server(ref_server, *end_hm)
    if end <= start:
        start -= timedelta(days=1)
    return start, end


# ----------------------------------------------------------------------------
# Data
# ----------------------------------------------------------------------------


def init_mt5():
    if not mt5.initialize():
        print("initialize() failed, error =", mt5.last_error())
        sys.exit(1)
    info = mt5.account_info()
    term = mt5.terminal_info()
    if info is not None:
        print(f"Connected: account {info.login} @ {info.server} | "
              f"terminal '{term.name if term else '?'}'")


def resolve_symbol(symbol: str) -> str:
    if mt5.symbol_info(symbol) is not None:
        mt5.symbol_select(symbol, True)
        return symbol
    # try a case-insensitive / contains match
    matches = [s.name for s in mt5.symbols_get() if symbol.lower() in s.name.lower()]
    if matches:
        print(f"Symbol '{symbol}' not exact; using closest match '{matches[0]}'. "
              f"Other matches: {matches[:8]}")
        mt5.symbol_select(matches[0], True)
        return matches[0]
    print(f"Symbol '{symbol}' not found. Use --list to see available symbols.")
    sys.exit(1)


def fetch_m1(symbol: str, date_from: datetime, date_to: datetime) -> pd.DataFrame:
    # Returned 'time' is broker SERVER time. copy_rates_range errors out when the
    # start predates the M1 history stored in the terminal, so we fetch by bar
    # count from date_to (which returns whatever history exists) and filter.
    # We also warm up the download with a few retries, because the terminal may
    # fetch history from the server asynchronously on the first request.
    import time as _time

    # Large counts trip "Invalid params" on this build, so we accumulate the
    # history in ~monthly chunks (copy_rates_from stepping backwards). Each call
    # also nudges the terminal to download that slice from the server.
    CHUNK = 45_000                      # ~1 month of M1 bars
    frames = []
    chunk_end = date_to
    prev_earliest = None
    for _ in range(24):                 # up to ~2 years back
        rates = None
        for attempt in range(4):
            rates = mt5.copy_rates_from(symbol, mt5.TIMEFRAME_M1,
                                        chunk_end.replace(tzinfo=timezone.utc), CHUNK)
            if rates is not None and len(rates) > 0:
                break
            _time.sleep(0.7)
        if rates is None or len(rates) == 0:
            break
        f = pd.DataFrame(rates)
        f["dt"] = pd.to_datetime(f["time"], unit="s")
        frames.append(f)
        earliest = f["dt"].min().to_pydatetime()
        if prev_earliest is not None and earliest >= prev_earliest:
            break                        # no new (older) history -> hit the limit
        prev_earliest = earliest
        if earliest <= date_from:
            break
        chunk_end = earliest - timedelta(minutes=1)

    if not frames:
        print("No data returned. error =", mt5.last_error())
        sys.exit(1)

    df = pd.concat(frames, ignore_index=True)
    df = df.drop_duplicates(subset="time")
    df["dt"] = pd.to_datetime(df["time"], unit="s")  # naive == server time
    df = df.set_index("dt").sort_index()
    earliest = df.index.min()
    df = df[(df.index >= date_from) & (df.index <= date_to)]
    if df.empty:
        print(f"No bars in the requested window. Earliest M1 history the terminal "
              f"has for {symbol} is {earliest}. Try a later --from date.")
        sys.exit(1)
    if date_from < earliest:
        print(f"  NOTE: terminal only has M1 history back to {earliest}; "
              f"using that as the start.")
    return df[["open", "high", "low", "close", "tick_volume"]]


# ----------------------------------------------------------------------------
# Strategy simulation
# ----------------------------------------------------------------------------


@dataclass
class Trade:
    day: datetime
    direction: str      # "long" / "short"
    entry_time: datetime
    entry: float
    sl: float
    tp: float
    exit_time: datetime
    exit: float
    r: float            # result in R multiples
    outcome: str        # "tp" / "sl" / "cutoff"


def compute_rsi_on_m1(df: pd.DataFrame, tf_min: int, period: int) -> np.ndarray:
    """Wilder RSI on a resampled timeframe, aligned to M1 bars using only the
    most recently CLOSED higher-timeframe bar (no look-ahead)."""
    rule = f"{tf_min}min"
    o = df["close"].resample(rule, label="left", closed="left").last().dropna()
    delta = o.diff()
    gain = delta.clip(lower=0.0)
    loss = (-delta).clip(lower=0.0)
    avg_gain = gain.ewm(alpha=1.0 / period, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1.0 / period, adjust=False).mean()
    rs = avg_gain / avg_loss.replace(0.0, np.nan)
    rsi = (100.0 - 100.0 / (1.0 + rs)).fillna(50.0)

    close_times = rsi.index + pd.Timedelta(minutes=tf_min)   # bar is usable at its close
    right = pd.DataFrame({"t": close_times.values, "rsi": rsi.values}).sort_values("t")
    left = pd.DataFrame({"t": df.index.values}).sort_values("t")
    merged = pd.merge_asof(left, right, on="t", direction="backward")
    return merged["rsi"].to_numpy()


def build_daily(df: pd.DataFrame) -> pd.DataFrame:
    """Broker daily candles (00:00 server = 5pm NY close) from M1 bars."""
    d = df.resample("1D").agg(open=("open", "first"), high=("high", "max"),
                              low=("low", "min"), close=("close", "last")).dropna()
    d["dir"] = np.sign(d["close"] - d["open"]).astype(int)  # +1 bull, -1 bear, 0 flat
    return d


def daily_bias(daily: pd.DataFrame, day, mode: str) -> int:
    """Return +1 (long only), -1 (short only), or 0 (no clear bias / skip)."""
    if mode == "none":
        return 0
    prior = daily[daily.index.date < day]
    if mode == "prev1":
        return int(prior["dir"].iloc[-1]) if len(prior) >= 1 else 0
    if mode == "prev2":
        if len(prior) < 2:
            return 0
        a, b = int(prior["dir"].iloc[-1]), int(prior["dir"].iloc[-2])
        return a if (a == b and a != 0) else 0
    return 0


def session_hilo(day_bars: pd.DataFrame, start: datetime, end: datetime):
    win = day_bars[(day_bars.index >= start) & (day_bars.index < end)]
    if win.empty:
        return None
    return float(win["high"].max()), float(win["low"].min())


def simulate(df: pd.DataFrame, cfg: Config) -> list[Trade]:
    point = cfg.point
    buf = cfg.sl_buffer_points * point
    min_gap = cfg.min_fvg_points * point
    spread = cfg.spread_points * point
    trades: list[Trade] = []

    daily = build_daily(df) if cfg.bias_mode != "none" else None
    if cfg.use_rsi and "rsi" not in df.columns:
        df = df.copy()
        df["rsi"] = compute_rsi_on_m1(df, cfg.rsi_tf, cfg.rsi_period)

    server_dates = sorted({d.date() for d in df.index})
    for sd in server_dates:
        ref = datetime(sd.year, sd.month, sd.day, 12, 0, 0)  # noon server as anchor

        bias = daily_bias(daily, sd, cfg.bias_mode) if daily is not None else 0
        if cfg.bias_mode != "none" and bias == 0:
            continue                                 # no clear HTF bias -> skip day
        allow_long = (cfg.bias_mode == "none") or (bias > 0)
        allow_short = (cfg.bias_mode == "none") or (bias < 0)

        ny_start_s = ny_to_server(ref, *cfg.ny_start)
        ny_end_s = ny_to_server(ref, *cfg.ny_end)

        # day bars: everything up to the cutoff of this server day
        day_bars = df[(df.index >= ref - timedelta(hours=24)) & (df.index <= ny_end_s)]
        if day_bars.empty:
            continue

        # session ranges
        highs, lows = [], []
        if cfg.use_asia:
            a_s, a_e = session_bounds(ref, cfg.asia_start, cfg.asia_end)
            r = session_hilo(day_bars, a_s, a_e)
            if r:
                highs.append(r[0]); lows.append(r[1])
        if cfg.use_london:
            l_s, l_e = session_bounds(ref, cfg.london_start, cfg.london_end)
            r = session_hilo(day_bars, l_s, l_e)
            if r:
                highs.append(r[0]); lows.append(r[1])
        if not highs:
            continue

        if cfg.sweep_outer:
            high_lvl, low_lvl = max(highs), min(lows)
        else:
            high_lvl, low_lvl = min(highs), max(lows)

        # bars inside the hunt window
        hunt = df[(df.index >= ny_start_s) & (df.index <= ny_end_s)]
        if len(hunt) < 4:
            continue
        h = hunt["high"].to_numpy()
        lo = hunt["low"].to_numpy()
        cl = hunt["close"].to_numpy()
        op = hunt["open"].to_numpy()
        rsi_arr = hunt["rsi"].to_numpy() if "rsi" in hunt.columns else None
        times = hunt.index.to_pydatetime()
        n = len(hunt)

        swept = False
        sweep_dir = 0        # +1 high swept (short bias), -1 low swept (long bias)
        sweep_extreme = 0.0
        sweep_idx = -1
        trades_today = 0

        i = 0
        while i < n:
            if trades_today >= cfg.max_trades_per_day:
                break

            if not swept:
                high_hit = (h[i] > high_lvl) and allow_short   # high sweep -> short
                low_hit = (lo[i] < low_lvl) and allow_long      # low sweep  -> long
                if high_hit and (h[i] - high_lvl) >= (low_lvl - lo[i] if low_hit else -1e18):
                    swept, sweep_dir, sweep_extreme, sweep_idx = True, +1, h[i], i
                elif low_hit:
                    swept, sweep_dir, sweep_extreme, sweep_idx = True, -1, lo[i], i
                i += 1
                continue

            # track grab extreme
            if sweep_dir > 0:
                sweep_extreme = max(sweep_extreme, h[i])
            else:
                sweep_extreme = min(sweep_extreme, lo[i])

            # need 3 closed bars forming after the sweep: triple (i-2, i-1, i)
            if i >= 2 and i > sweep_idx:
                found = None
                if sweep_dir < 0:  # long bias -> bullish FVG: high[i-2] < low[i]
                    if h[i - 2] < lo[i] and (lo[i] - h[i - 2]) >= min_gap:
                        found = "long"
                else:              # short bias -> bearish FVG: low[i-2] > high[i]
                    if lo[i - 2] > h[i] and (lo[i - 2] - h[i]) >= min_gap:
                        found = "short"

                if found and cfg.use_rsi and rsi_arr is not None:
                    rv = rsi_arr[i]
                    if found == "long" and not (rv <= cfg.rsi_os):
                        found = None
                    elif found == "short" and not (rv >= cfg.rsi_ob):
                        found = None

                if found:
                    trade = enter_and_manage(
                        hunt, i, found, sweep_extreme, buf, spread, cfg, ny_end_s
                    )
                    if trade:
                        trades.append(trade)
                        trades_today += 1
                        # after a trade we're done hunting for the day (max=1 default)
                        break
            i += 1

    return trades


def enter_and_manage(hunt, i, direction, sweep_extreme, buf, spread, cfg, cutoff):
    times = hunt.index.to_pydatetime()
    h = hunt["high"].to_numpy()
    lo = hunt["low"].to_numpy()
    cl = hunt["close"].to_numpy()
    n = len(hunt)

    if direction == "long":
        entry = cl[i] + spread / 2.0
        sl = sweep_extreme - buf
        risk = entry - sl
        if risk <= 0:
            return None
        tp = entry + risk * cfg.rr
    else:
        entry = cl[i] - spread / 2.0
        sl = sweep_extreme + buf
        risk = sl - entry
        if risk <= 0:
            return None
        tp = entry - risk * cfg.rr

    entry_time = times[i]
    # walk forward
    for j in range(i + 1, n):
        hi_j, lo_j = h[j], lo[j]
        if direction == "long":
            hit_sl = lo_j <= sl
            hit_tp = hi_j >= tp
            if hit_sl and hit_tp:
                return Trade(entry_time.date(), direction, entry_time, entry, sl, tp,
                             times[j], sl, -1.0, "sl")   # conservative: SL first
            if hit_sl:
                return Trade(entry_time.date(), direction, entry_time, entry, sl, tp,
                             times[j], sl, -1.0, "sl")
            if hit_tp:
                return Trade(entry_time.date(), direction, entry_time, entry, sl, tp,
                             times[j], tp, cfg.rr, "tp")
        else:
            hit_sl = hi_j >= sl
            hit_tp = lo_j <= tp
            if hit_sl and hit_tp:
                return Trade(entry_time.date(), direction, entry_time, entry, sl, tp,
                             times[j], sl, -1.0, "sl")
            if hit_sl:
                return Trade(entry_time.date(), direction, entry_time, entry, sl, tp,
                             times[j], sl, -1.0, "sl")
            if hit_tp:
                return Trade(entry_time.date(), direction, entry_time, entry, sl, tp,
                             times[j], tp, cfg.rr, "tp")

    # reached end of hunt window without SL/TP
    if cfg.close_at_cutoff:
        exit_px = cl[-1]
        if direction == "long":
            r = (exit_px - entry) / risk
        else:
            r = (entry - exit_px) / risk
        return Trade(entry_time.date(), direction, entry_time, entry, sl, tp,
                     times[-1], exit_px, r, "cutoff")
    return None


# ----------------------------------------------------------------------------
# Reporting
# ----------------------------------------------------------------------------


def compute_stats(trades: list[Trade]) -> dict:
    if not trades:
        return dict(trades=0, win_rate=0.0, total_r=0.0, avg_r=0.0, pf=0.0,
                    max_dd_r=0.0, max_streak=0)
    rs = np.array([t.r for t in trades], dtype=float)
    wins = rs[rs > 0]
    losses = rs[rs < 0]
    gross_win = wins.sum()
    gross_loss = abs(losses.sum())
    pf = gross_win / gross_loss if gross_loss > 0 else float("inf")
    # R-based equity drawdown
    eq = np.concatenate([[0.0], rs.cumsum()])
    peak = np.maximum.accumulate(eq)
    max_dd_r = float((peak - eq).max())
    streak = mx = 0
    for r in rs:
        streak = streak + 1 if r < 0 else 0
        mx = max(mx, streak)
    return dict(trades=len(rs), win_rate=len(wins) / len(rs) * 100.0,
                total_r=float(rs.sum()), avg_r=float(rs.mean()), pf=pf,
                max_dd_r=max_dd_r, max_streak=mx)


def optimize(df: pd.DataFrame, base: Config, symbol: str):
    """Grid search over the key parameters and rank by total R."""
    rr_grid = [1.0, 1.5, 2.0, 2.5, 3.0]
    outer_grid = [True, False]
    minfvg_grid = [0, 5, 10, 20]        # in points
    buffer_grid = [10, 20, 40]          # in points

    rows = []
    total = len(rr_grid) * len(outer_grid) * len(minfvg_grid) * len(buffer_grid)
    print(f"\nRunning parameter sweep: {total} combinations on {symbol} ...")
    done = 0
    for rr in rr_grid:
        for outer in outer_grid:
            for mf in minfvg_grid:
                for bf in buffer_grid:
                    cfg = copy.copy(base)
                    cfg.rr = rr
                    cfg.sweep_outer = outer
                    cfg.min_fvg_points = mf
                    cfg.sl_buffer_points = bf
                    trades = simulate(df, cfg)
                    s = compute_stats(trades)
                    rows.append(dict(rr=rr, sweep="outer" if outer else "nearest",
                                     min_fvg=mf, sl_buffer=bf, **s))
                    done += 1
                    if done % 20 == 0:
                        print(f"  {done}/{total} ...")

    res = pd.DataFrame(rows)
    res = res.sort_values(["total_r", "pf"], ascending=False).reset_index(drop=True)
    out_csv = f"optimize_{symbol}.csv"
    res.to_csv(out_csv, index=False)

    show = res.head(15).copy()
    for col in ("win_rate", "total_r", "avg_r", "pf", "max_dd_r"):
        show[col] = show[col].map(lambda x: f"{x:.2f}")
    print("\n" + "=" * 78)
    print(f"  TOP PARAMETER SETS  |  {symbol}   (ranked by Total R)")
    print("=" * 78)
    print(show.to_string(index=False))
    print("=" * 78)
    print(f"  Full grid saved : {out_csv}")


def report(trades: list[Trade], cfg: Config, symbol: str):
    if not trades:
        print("\nNo trades were generated for the given period/parameters.")
        return

    tr = pd.DataFrame([t.__dict__ for t in trades])
    wins = tr[tr["r"] > 0]
    losses = tr[tr["r"] < 0]
    n = len(tr)
    win_rate = len(wins) / n * 100.0
    total_r = tr["r"].sum()
    avg_r = tr["r"].mean()
    gross_win = wins["r"].sum()
    gross_loss = abs(losses["r"].sum())
    pf = gross_win / gross_loss if gross_loss > 0 else float("inf")

    # max consecutive losses
    max_streak = streak = 0
    for r in tr["r"]:
        if r < 0:
            streak += 1
            max_streak = max(max_streak, streak)
        else:
            streak = 0

    # money model
    bal = cfg.start_balance
    equity = [bal]
    peak = bal
    max_dd = 0.0
    for r in tr["r"]:
        risk_amt = bal * cfg.risk_percent / 100.0 if cfg.compounding \
            else cfg.start_balance * cfg.risk_percent / 100.0
        bal += r * risk_amt
        equity.append(bal)
        peak = max(peak, bal)
        max_dd = max(max_dd, (peak - bal) / peak * 100.0)

    tr["equity"] = equity[1:]

    print("\n" + "=" * 60)
    print(f"  BACKTEST RESULTS  |  {symbol}")
    print("=" * 60)
    print(f"  Period          : {tr['entry_time'].min()}  ->  {tr['exit_time'].max()}")
    print(f"  Trades          : {n}")
    print(f"  Wins / Losses   : {len(wins)} / {len(losses)}   ({win_rate:.1f}% win rate)")
    print(f"  Outcomes        : TP={sum(tr.outcome=='tp')}  "
          f"SL={sum(tr.outcome=='sl')}  cutoff={sum(tr.outcome=='cutoff')}")
    print(f"  Total R         : {total_r:+.2f} R")
    print(f"  Avg R / trade   : {avg_r:+.3f} R  (expectancy)")
    print(f"  Profit factor   : {pf:.2f}")
    print(f"  Max consec loss : {max_streak}")
    print(f"  RR target       : 1:{cfg.rr:g}")
    print("-" * 60)
    print(f"  Money model     : start ${cfg.start_balance:,.0f}, "
          f"risk {cfg.risk_percent:g}%/trade, "
          f"{'compounding' if cfg.compounding else 'fixed'}")
    print(f"  End balance     : ${bal:,.2f}   "
          f"({(bal/cfg.start_balance-1)*100:+.1f}%)")
    print(f"  Max drawdown    : {max_dd:.1f}%")
    print("=" * 60)

    out_csv = f"backtest_{symbol}_trades.csv"
    tr.to_csv(out_csv, index=False)
    print(f"  Trades saved    : {out_csv}")

    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt

        fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(11, 7),
                                       gridspec_kw={"height_ratios": [2, 1]})
        ax1.plot(range(len(equity)), equity, color="#1f77b4", lw=1.6)
        ax1.set_title(f"{symbol}  Equity curve  (start ${cfg.start_balance:,.0f}, "
                      f"risk {cfg.risk_percent:g}%, 1:{cfg.rr:g} RR)")
        ax1.set_ylabel("Balance ($)")
        ax1.grid(alpha=0.3)

        cum_r = np.concatenate([[0], tr["r"].cumsum().to_numpy()])
        ax2.plot(range(len(cum_r)), cum_r, color="#2ca02c", lw=1.4)
        ax2.set_title("Cumulative R")
        ax2.set_xlabel("Trade #")
        ax2.set_ylabel("R")
        ax2.grid(alpha=0.3)

        fig.tight_layout()
        out_png = f"backtest_{symbol}_equity.png"
        fig.savefig(out_png, dpi=110)
        print(f"  Equity chart    : {out_png}")
    except Exception as exc:  # pragma: no cover
        print(f"  (plot skipped: {exc})")


# ----------------------------------------------------------------------------
# Main
# ----------------------------------------------------------------------------


def parse_args():
    p = argparse.ArgumentParser(description="Backtest the Asian/London Sweep + M1 FVG strategy")
    p.add_argument("--symbol", default="EURUSD")
    p.add_argument("--from", dest="date_from", default=None, help="YYYY-MM-DD")
    p.add_argument("--to", dest="date_to", default=None, help="YYYY-MM-DD")
    p.add_argument("--days", type=int, default=120, help="lookback if --from not given")
    p.add_argument("--rr", type=float, default=2.0)
    p.add_argument("--risk", type=float, default=1.0, help="risk %% per trade")
    p.add_argument("--balance", type=float, default=10_000.0)
    p.add_argument("--sl-buffer", type=int, default=20, help="SL buffer in points")
    p.add_argument("--min-fvg", type=int, default=0, help="min FVG size in points")
    p.add_argument("--max-trades", type=int, default=1)
    p.add_argument("--nearest", action="store_true", help="use nearest level instead of outer")
    p.add_argument("--sessions", choices=["both", "asia", "london"], default="both",
                   help="which session's levels to watch for the sweep")
    p.add_argument("--bias", choices=["none", "prev1", "prev2"], default="none",
                   help="daily HTF bias filter: prev1=yesterday's candle, "
                        "prev2=last two daily candles must agree")
    p.add_argument("--rsi", action="store_true", help="enable RSI confirmation filter")
    p.add_argument("--rsi-tf", type=int, default=5, help="RSI timeframe in minutes")
    p.add_argument("--rsi-period", type=int, default=14)
    p.add_argument("--rsi-os", type=float, default=30.0, help="oversold threshold (longs)")
    p.add_argument("--rsi-ob", type=float, default=70.0, help="overbought threshold (shorts)")
    p.add_argument("--no-compound", action="store_true")
    p.add_argument("--spread", type=float, default=0.0, help="spread in points")
    p.add_argument("--optimize", action="store_true", help="run a parameter sweep")
    p.add_argument("--list", action="store_true", help="list available symbols and exit")
    return p.parse_args()


def main():
    args = parse_args()
    init_mt5()

    if args.list:
        syms = [s.name for s in mt5.symbols_get()]
        print(f"{len(syms)} symbols available. Sample:")
        for s in syms[:60]:
            print("  ", s)
        mt5.shutdown()
        return

    symbol = resolve_symbol(args.symbol)
    info = mt5.symbol_info(symbol)

    if args.date_to:
        date_to = datetime.strptime(args.date_to, "%Y-%m-%d")
    else:
        date_to = datetime.now()
    if args.date_from:
        date_from = datetime.strptime(args.date_from, "%Y-%m-%d")
    else:
        date_from = date_to - timedelta(days=args.days)

    cfg = Config(
        symbol=symbol,
        date_from=date_from,
        date_to=date_to,
        rr=args.rr,
        risk_percent=args.risk,
        start_balance=args.balance,
        sl_buffer_points=args.sl_buffer,
        min_fvg_points=args.min_fvg,
        max_trades_per_day=args.max_trades,
        sweep_outer=not args.nearest,
        compounding=not args.no_compound,
        spread_points=args.spread,
        use_asia=args.sessions in ("both", "asia"),
        use_london=args.sessions in ("both", "london"),
        bias_mode=args.bias,
        use_rsi=args.rsi,
        rsi_tf=args.rsi_tf,
        rsi_period=args.rsi_period,
        rsi_os=args.rsi_os,
        rsi_ob=args.rsi_ob,
    )
    cfg.point = info.point

    print(f"\nFetching M1 data for {symbol}: {date_from:%Y-%m-%d} -> {date_to:%Y-%m-%d} ...")
    df = fetch_m1(symbol, date_from, date_to)
    print(f"  {len(df):,} M1 bars loaded "
          f"({df.index.min()} -> {df.index.max()}, server time)")

    if args.optimize:
        optimize(df, cfg, symbol)
    else:
        trades = simulate(df, cfg)
        report(trades, cfg, symbol)

    mt5.shutdown()


if __name__ == "__main__":
    main()
