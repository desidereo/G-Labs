"""
Multi-year out-of-sample validation using FREE Dukascopy M1 data.

Why: the IC Markets demo only stores ~3 months of M1, far too little to trust
any result. Dukascopy provides years of history for free. We download M1,
convert it into the same IC-Markets server-time convention the strategy uses
(GMT+2 winter / GMT+3 during US DST), then run the baseline vs the RSI+FVG grid
so we can see whether the RSI edge holds on a real sample (~thousands of trades).

Usage:
    python validate_dukascopy.py --symbol EURUSD --from 2022 --to 2025
    python validate_dukascopy.py --symbol XAUUSD --from 2023 --to 2025
Data is cached per year in ./duka_cache so re-runs are instant.
"""

import argparse
import copy
import os
from datetime import datetime, timedelta

import numpy as np
import pandas as pd

import dukascopy_python as dk
from dukascopy_python.instruments import (
    INSTRUMENT_FX_MAJORS_EUR_USD,
    INSTRUMENT_FX_METALS_XAU_USD,
)

import backtest_sweep_fvg as bt

CACHE = os.path.join(os.path.dirname(__file__), "duka_cache")
os.makedirs(CACHE, exist_ok=True)

INSTRUMENTS = {
    "EURUSD": (INSTRUMENT_FX_MAJORS_EUR_USD, 0.00001),
    "XAUUSD": (INSTRUMENT_FX_METALS_XAU_USD, 0.01),
}

RSI_TFS = [5, 15]
THRESHOLDS = [(25, 75), (30, 70), (35, 65)]


def us_dst_offset(idx_naive_utc: pd.DatetimeIndex) -> np.ndarray:
    """+3 during US DST else +2 (IC Markets server convention), vectorised."""
    off = np.full(len(idx_naive_utc), 2, dtype=int)
    for y in np.unique(idx_naive_utc.year):
        s = bt.nth_sunday(int(y), 3, 2) + timedelta(hours=2)
        e = bt.nth_sunday(int(y), 11, 1) + timedelta(hours=2)
        mask = (idx_naive_utc >= s) & (idx_naive_utc < e)
        off[mask] = 3
    return off


def fetch_year(instrument, year: int) -> pd.DataFrame:
    start = datetime(year, 1, 1)
    end = datetime(year + 1, 1, 1)
    df = dk.fetch(instrument, dk.INTERVAL_MIN_1, dk.OFFER_SIDE_BID, start, end)
    return df


def load_server_m1(symbol: str, y_from: int, y_to: int) -> pd.DataFrame:
    instrument, _ = INSTRUMENTS[symbol]
    frames = []
    for year in range(y_from, y_to + 1):
        path = os.path.join(CACHE, f"{symbol}_{year}.csv")
        if os.path.exists(path):
            frames.append(pd.read_csv(path, index_col=0, parse_dates=True))
            print(f"  cache  {symbol} {year}")
            continue
        print(f"  fetch  {symbol} {year} from Dukascopy ...")
        df = fetch_year(instrument, year)
        if df is None or df.empty:
            print(f"    (no data for {year})")
            continue
        df.to_csv(path)
        frames.append(df)

    if not frames:
        raise SystemExit("No data downloaded.")

    raw = pd.concat(frames)
    raw = raw[~raw.index.duplicated(keep="first")].sort_index()

    idx_utc = raw.index.tz_convert("UTC").tz_localize(None)
    server = idx_utc + pd.to_timedelta(us_dst_offset(idx_utc), unit="h")

    out = raw.copy()
    out.index = server
    out.index.name = "dt"
    out = out.rename(columns={"volume": "tick_volume"})
    return out[["open", "high", "low", "close", "tick_volume"]].sort_index()


def run(symbol: str, y_from: int, y_to: int):
    point = INSTRUMENTS[symbol][1]
    print(f"\nLoading {symbol} M1 {y_from}-{y_to} (server time) ...")
    df = load_server_m1(symbol, y_from, y_to)
    print(f"  {len(df):,} M1 bars  ({df.index.min()} -> {df.index.max()})")

    base = bt.Config(symbol=symbol, date_from=df.index.min().to_pydatetime(),
                     date_to=df.index.max().to_pydatetime(), rr=2.0, risk_percent=1.0)
    base.point = point

    print(f"\n{'filter':16} {'trades':>7} {'win%':>6} {'totalR':>9} "
          f"{'PF':>6} {'avgR':>7} {'maxDDr':>8}")
    print("-" * 62)

    def show(label, cfg):
        s = bt.compute_stats(bt.simulate(df, cfg))
        pf = s["pf"]
        pf_s = "inf" if pf == float("inf") else f"{pf:.2f}"
        print(f"{label:16} {s['trades']:>7} {s['win_rate']:>6.1f} "
              f"{s['total_r']:>+9.2f} {pf_s:>6} {s['avg_r']:>+7.3f} {s['max_dd_r']:>8.2f}")
        return s

    show("baseline", base)
    for tf in RSI_TFS:
        for os_, ob in THRESHOLDS:
            cfg = copy.copy(base)
            cfg.use_rsi = True
            cfg.rsi_tf = tf
            cfg.rsi_os = os_
            cfg.rsi_ob = ob
            show(f"RSI M{tf} {os_}/{ob}", cfg)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--symbol", default="EURUSD", choices=list(INSTRUMENTS))
    p.add_argument("--from", dest="y_from", type=int, default=2022)
    p.add_argument("--to", dest="y_to", type=int, default=2025)
    a = p.parse_args()
    run(a.symbol, a.y_from, a.y_to)


if __name__ == "__main__":
    main()
