"""
Event-study lab for the pre-registered hypotheses in mt5/research/edge_research.md.

All studies run on Dukascopy M1 (UTC). No trading rules here -- this module
measures the GROSS conditional effects that gate whether a trading rule is
even worth building. Parameter-free by design (windows fixed in the research
doc before running).

Usage:
    python edge_lab.py --study fix   --from 2022 --to 2024
    python edge_lab.py --study night --from 2022 --to 2024
    python edge_lab.py --study orb   --from 2022 --to 2024
"""

from __future__ import annotations

import argparse
import calendar
import os
from datetime import datetime, timedelta

import numpy as np
import pandas as pd

CACHE = os.path.join(os.path.dirname(__file__), "duka_cache")

SYMBOLS = ["EURUSD", "GBPUSD", "USDJPY", "XAUUSD"]

# round-trip costs in PRICE units (spread + commission + slippage), per research doc
COSTS = {
    #            liquid      off-hours
    "EURUSD": (0.00010, 0.00023),
    "GBPUSD": (0.00010, 0.00023),
    "USDJPY": (0.013,   0.028),
    "XAUUSD": (0.25,    0.60),
}
POINT = {"EURUSD": 0.00001, "GBPUSD": 0.00001, "USDJPY": 0.001, "XAUUSD": 0.01}


# ---------------------------------------------------------------- data / time


def load_utc(symbol: str, y_from: int, y_to: int) -> pd.DataFrame:
    frames = []
    for y in range(y_from, y_to + 1):
        path = os.path.join(CACHE, f"{symbol}_{y}.csv")
        if not os.path.exists(path):
            raise SystemExit(f"missing cache file {path}")
        frames.append(pd.read_csv(path, index_col=0, parse_dates=True))
    df = pd.concat(frames)
    df = df[~df.index.duplicated(keep="first")].sort_index()
    df.index = df.index.tz_convert("UTC").tz_localize(None)
    df.index.name = "dt"
    return df[["open", "high", "low", "close"]]


def last_sunday(year: int, month: int) -> datetime:
    last_day = calendar.monthrange(year, month)[1]
    d = datetime(year, month, last_day)
    return d - timedelta(days=(d.weekday() + 1) % 7)


def uk_offset_hours(idx: pd.DatetimeIndex) -> np.ndarray:
    """1 during UK BST (last Sun Mar 01:00 UTC -> last Sun Oct 01:00 UTC) else 0."""
    off = np.zeros(len(idx), dtype=int)
    for y in np.unique(idx.year):
        s = last_sunday(int(y), 3) + timedelta(hours=1)
        e = last_sunday(int(y), 10) + timedelta(hours=1)
        off[(idx >= s) & (idx < e)] = 1
    return off


def uk_offset_scalar(dt: datetime) -> int:
    s = last_sunday(dt.year, 3) + timedelta(hours=1)
    e = last_sunday(dt.year, 10) + timedelta(hours=1)
    return 1 if s <= dt < e else 0


def price_at(close: pd.Series, stamps: pd.DatetimeIndex,
             tol_min: int = 10) -> np.ndarray:
    """Last traded close AT wall-clock time t = close of the bar indexed t-1min
    (bar index is its open time). NaN when no bar within tolerance."""
    return close.reindex(stamps - pd.Timedelta(minutes=1), method="ffill",
                         tolerance=pd.Timedelta(minutes=tol_min)).to_numpy()


def daily_atr(df: pd.DataFrame, n: int = 20) -> pd.Series:
    """20-day rolling mean of daily range, lagged one day (no look-ahead).
    Indexed by UTC date."""
    d = df.resample("1D").agg(high=("high", "max"), low=("low", "min")).dropna()
    atr = (d["high"] - d["low"]).rolling(n, min_periods=n).mean().shift(1)
    atr.index = atr.index.date
    return atr


def tstat(x: np.ndarray) -> float:
    x = x[~np.isnan(x)]
    if len(x) < 3 or x.std(ddof=1) == 0:
        return float("nan")
    return float(x.mean() / (x.std(ddof=1) / np.sqrt(len(x))))


# ------------------------------------------------------------- H1: fix study


def study_fix(y_from: int, y_to: int, pre_min: int = 40):
    print(f"\n=== H1 London-fix reversal | {y_from}-{y_to} | pre-window {pre_min}m ===")
    print("fadePnL = -sign(pre-fix move) * post-fix return, in ATR units (gross)")
    for sym in SYMBOLS:
        df = load_utc(sym, y_from, y_to)
        atr = daily_atr(df)
        close = df["close"]

        dates = pd.DatetimeIndex(sorted({d for d in df.index.normalize().unique()}))
        # fix at 16:00 London on each date
        off = uk_offset_hours(dates)
        fix = dates + pd.to_timedelta(16 - off, unit="h")

        p_fix = price_at(close, fix)
        p_pre = price_at(close, fix - pd.Timedelta(minutes=pre_min))
        posts = {k: price_at(close, fix + pd.Timedelta(minutes=k)) for k in (15, 30, 60)}

        a = np.array([atr.get(d.date(), np.nan) for d in dates])
        move = (p_fix - p_pre) / a
        ok = ~np.isnan(move) & ~np.isnan(a)
        # weekends produce NaN lookups; also drop Sat/Sun explicitly
        ok &= ~np.isin(dates.dayofweek, [5, 6])

        is_me = np.zeros(len(dates), dtype=bool)  # month-end (last trading day)
        dser = pd.Series(dates[ok])
        month_last = dser.groupby([dser.dt.year, dser.dt.month]).max()
        is_me[np.isin(dates, month_last.values)] = True

        bins = [0.0, 0.05, 0.10, 0.20, np.inf]
        labels = ["0-.05", ".05-.10", ".10-.20", ">.20"]
        print(f"\n{sym}  (n days = {int(ok.sum())}, cost_liq = "
              f"{COSTS[sym][0]:.5g} price units)")
        hdr = f"  {'bucket':8}" + "".join(f" | {'+%dm' % k:>7} {'t':>6} {'n':>5}" for k in (15, 30, 60))
        print(hdr + " | net30m(price)")
        for lo, hi, lab in zip(bins[:-1], bins[1:], labels):
            m = ok & (np.abs(move) >= lo) & (np.abs(move) < hi)
            row = f"  {lab:8}"
            net30 = np.nan
            for k in (15, 30, 60):
                fade = -np.sign(move[m]) * (posts[k][m] - p_fix[m]) / a[m]
                row += f" | {np.nanmean(fade):+7.4f} {tstat(fade):>6.2f} {int((~np.isnan(fade)).sum()):>5}"
                if k == 30:
                    fade_px = -np.sign(move[m]) * (posts[k][m] - p_fix[m])
                    net30 = np.nanmean(fade_px) - COSTS[sym][0]
            print(row + f" | {net30:+.6f}")
        # month-end only, biggest bucket irrelevant, just all month-end days
        m = ok & is_me
        fade = -np.sign(move[m]) * (posts[30][m] - p_fix[m]) / a[m]
        print(f"  m-end   | +30m {np.nanmean(fade):+7.4f}  t {tstat(fade):>5.2f}  n {int((~np.isnan(fade)).sum())}")


# ----------------------------------------------------------- H2: night study


def study_night(y_from: int, y_to: int, win: int = 240):
    print(f"\n=== H2 quiet-hours mean reversion | {y_from}-{y_to} | rolling {win}m ===")
    print("fadePnL = -sign(z) * forward return; events = first |z|-crossing per night+dir")
    for sym in SYMBOLS:
        df = load_utc(sym, y_from, y_to)
        close = df["close"]
        mean = close.rolling(win, min_periods=win).mean()
        std = close.rolling(win, min_periods=win).std()
        z = (close - mean) / std.replace(0.0, np.nan)

        hours = df.index.hour
        in_win = (hours >= 21) | (hours < 6)
        # night id: date of the 21:00 that started the night
        night = (df.index - pd.Timedelta(hours=21)).normalize()
        dow = pd.DatetimeIndex(night).dayofweek
        in_win &= ~np.isin(dow, [4, 5])  # Fri/Sat nights are closed/thin

        print(f"\n{sym}   (off-hours RT cost {COSTS[sym][1]:.5g} price units)")
        print(f"  {'z*':>4} {'dir':>4} | {'+30m':>8} {'t':>6} | {'+60m':>8} {'t':>6} | "
              f"{'+120m':>8} {'t':>6} | {'n':>5} | net60m(price)")
        for zthr in (1.5, 2.0, 2.5):
            for sgn in (+1, -1):
                zz = z.to_numpy() * sgn  # analyse crossings of +thr on sgn*z
                cross = (zz >= zthr) & (np.roll(zz, 1) < zthr) & in_win
                cross[0] = False
                # first crossing per night
                ev_ser = pd.Series(night[cross], index=df.index[cross])
                ev_idx = pd.DatetimeIndex(ev_ser.groupby(ev_ser.values).head(1).index)
                if len(ev_idx) < 20:
                    continue
                p0 = close.reindex(ev_idx).to_numpy()
                out = []
                for k in (30, 60, 120):
                    pk = price_at(close, ev_idx + pd.Timedelta(minutes=k + 1))
                    fade = -sgn * (pk - p0)
                    out.append(fade)
                # normalise by ATR for cross-symbol readability
                atr = daily_atr(df)
                a = np.array([atr.get(d.date(), np.nan) for d in ev_idx])
                row = f"  {zthr:>4.1f} {'+' if sgn > 0 else '-':>4}"
                for fade in out:
                    fa = fade / a
                    row += f" | {np.nanmean(fa):+8.4f} {tstat(fa):>6.2f}"
                net60 = np.nanmean(out[1]) - COSTS[sym][1]
                row += f" | {len(ev_idx):>5} | {net60:+.6f}"
                print(row)


# ------------------------------------------------------------- H3: ORB study


def study_orb(y_from: int, y_to: int):
    print(f"\n=== H3 London-open range breakout | {y_from}-{y_to} ===")
    print("range 03:00-08:00 London, breakout window 08:00-11:00, time exit 17:00")
    for sym in SYMBOLS:
        df = load_utc(sym, y_from, y_to)
        idx = df.index
        offs = uk_offset_hours(idx)
        lon = idx + pd.to_timedelta(offs, unit="h")     # London wall clock
        ldate = lon.normalize()
        lhour = lon.hour + lon.minute / 60.0

        h = df["high"].to_numpy(); l = df["low"].to_numpy(); c = df["close"].to_numpy()
        res = []
        for day, grp in pd.Series(np.arange(len(df)), index=ldate).groupby(level=0):
            if day.dayofweek >= 5:
                continue
            ii = grp.to_numpy()
            hh = lhour[ii]
            rng = ii[(hh >= 3) & (hh < 8)]
            hunt = ii[(hh >= 8) & (hh < 11)]
            after = ii[(hh >= 8) & (hh < 17)]
            if len(rng) < 200 or len(hunt) < 100:
                continue
            rh, rl = h[rng].max(), l[rng].min()
            size = rh - rl
            if size <= 0:
                continue
            up = h[hunt] > rh
            dn = l[hunt] < rl
            first_up = hunt[np.argmax(up)] if up.any() else None
            first_dn = hunt[np.argmax(dn)] if dn.any() else None
            if first_up is None and first_dn is None:
                continue
            if first_dn is None or (first_up is not None and first_up <= first_dn):
                side, e_i, entry, sl = +1, first_up, rh, rl
            else:
                side, e_i, entry, sl = -1, first_dn, rl, rh
            walk = after[after > e_i]
            pnl_r = None
            for j in walk:
                if side > 0 and l[j] <= sl:
                    pnl_r = -1.0; break
                if side < 0 and h[j] >= sl:
                    pnl_r = -1.0; break
            if pnl_r is None:
                exit_px = c[walk[-1]] if len(walk) else entry
                pnl_r = side * (exit_px - entry) / size
            res.append((day, side, pnl_r, size))

        r = np.array([x[2] for x in res])
        sizes = np.array([x[3] for x in res])
        cost_r = COSTS[sym][0] / sizes           # RT cost in R units per trade
        rn = r - cost_r
        pf = r[r > 0].sum() / abs(r[r < 0].sum()) if (r < 0).any() else float("inf")
        pfn = rn[rn > 0].sum() / abs(rn[rn < 0].sum()) if (rn < 0).any() else float("inf")
        print(f"\n{sym}: n={len(r)}  gross avgR={r.mean():+.4f} (t={tstat(r):.2f}) "
              f"PF={pf:.2f} | net avgR={rn.mean():+.4f} PF={pfn:.2f}")


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--study", required=True, choices=["fix", "night", "orb"])
    p.add_argument("--from", dest="y_from", type=int, default=2022)
    p.add_argument("--to", dest="y_to", type=int, default=2024)
    p.add_argument("--symbols", nargs="+", default=None)
    a = p.parse_args()
    if a.symbols:
        global SYMBOLS
        SYMBOLS = a.symbols
    {"fix": study_fix, "night": study_night, "orb": study_orb}[a.study](a.y_from, a.y_to)


if __name__ == "__main__":
    main()
