"""
London-open range breakout (H3 in mt5/research/edge_research.md) -- full
trade-rule backtester on Dukascopy M1 (UTC), with realistic IC-Markets-Raw
costs, IS/OOS discipline and per-year breakdowns.

Rule (all times LONDON wall clock, proper UK DST):
  * Range = high/low of [range_start, range_end)   (default 03:00-08:00)
  * First break of the range during [range_end, hunt_end) (default 08:00-11:00)
    enters WITH the break via stop order at the range level.
  * SL = opposite side of the range (risk = 1 range).
  * Optional TP at entry +/- target_r * range; otherwise exit at exit_hour
    (default 17:00 London) at market. One trade per day max.
  * Conservative fills: if a bar hits both SL and TP, count SL. On the entry
    bar only SL is evaluated (no same-bar TP credit).

Costs: round-trip cost in price units subtracted from every trade
(spread + $7/lot commission + slippage; see edge_research.md section 0).

Usage:
    python backtest_orb.py --grid --from 2022 --to 2024        # IS 2x2 grid + per-year
    python backtest_orb.py --from 2025 --to 2025 --png         # frozen config on OOS
    python backtest_orb.py --sensitivity --from 2022 --to 2024 # neighbourhood check
"""

from __future__ import annotations

import argparse
import os
from dataclasses import dataclass, replace

import numpy as np
import pandas as pd

from edge_lab import COSTS, SYMBOLS, load_utc, uk_offset_hours, tstat

OUT = os.path.dirname(__file__)


@dataclass
class OrbConfig:
    range_start: float = 3.0     # London hours
    range_end: float = 8.0
    hunt_end: float = 11.0
    exit_hour: float = 17.0
    target_r: float = 0.0        # 0 => time exit only
    cost_mult: float = 1.0       # scales the RT cost (sensitivity checks)

    # Volatility-regime filter (pre-registered 2026-08-13, BEFORE any 2026 run;
    # see research addendum). Rationale: risk = 1 range, so cost in R units is
    # cost/range -- trading only larger-than-usual ranges mechanically cuts the
    # cost drag, and breakouts from meaningful ranges should carry more signal.
    #   vol_mult > 0 : trade only if today's range >= vol_mult * trailing
    #                  median of the previous vol_lookback days' ranges.
    #   cost_cap > 0 : trade only if cost/range <= cost_cap (in R units).
    vol_mult: float = 0.0        # 0 => off. PRIMARY pre-registered value: 1.0
    vol_lookback: int = 20
    cost_cap: float = 0.0        # 0 => off. Secondary variant: 0.05


FROZEN = OrbConfig()             # frozen after IS: set in freeze_note below

# Frozen 2026-08-12 after the IS grid (see validation report): range 03-08,
# time-exit-only (target_r=0). Chosen BEFORE looking at 2025.


def simulate_orb(df: pd.DataFrame, symbol: str, cfg: OrbConfig) -> pd.DataFrame:
    idx = df.index
    lon = idx + pd.to_timedelta(uk_offset_hours(idx), unit="h")
    ldate = lon.normalize()
    lhour = (lon.hour + lon.minute / 60.0).astype(float)

    h = df["high"].to_numpy()
    l = df["low"].to_numpy()
    c = df["close"].to_numpy()
    times = idx.to_numpy()

    cost = COSTS[symbol][0] * cfg.cost_mult
    rows = []
    past_ranges: list = []       # ranges of PRIOR valid days only (no look-ahead)
    for day, grp in pd.Series(np.arange(len(df)), index=ldate).groupby(level=0):
        if day.dayofweek >= 5:
            continue
        ii = grp.to_numpy()
        hh = lhour[ii]
        rng = ii[(hh >= cfg.range_start) & (hh < cfg.range_end)]
        hunt = ii[(hh >= cfg.range_end) & (hh < cfg.hunt_end)]
        sess = ii[(hh >= cfg.range_end) & (hh < cfg.exit_hour)]
        if len(rng) < 0.66 * (cfg.range_end - cfg.range_start) * 60 or len(hunt) < 100:
            continue
        rh, rl = h[rng].max(), l[rng].min()
        size = rh - rl
        if size <= 0:
            continue

        # --- volatility-regime filter (uses only prior days' ranges) ---
        hist = past_ranges[-cfg.vol_lookback:]
        past_ranges.append(size)     # record regardless of whether we trade
        if cfg.vol_mult > 0:
            if len(hist) < cfg.vol_lookback:
                continue             # not enough history yet
            if size < cfg.vol_mult * float(np.median(hist)):
                continue
        if cfg.cost_cap > 0 and (cost / size) > cfg.cost_cap:
            continue

        up = h[hunt] > rh
        dn = l[hunt] < rl
        i_up = hunt[np.argmax(up)] if up.any() else None
        i_dn = hunt[np.argmax(dn)] if dn.any() else None
        if i_up is None and i_dn is None:
            continue
        if i_dn is None or (i_up is not None and i_up <= i_dn):
            side, e_i, entry, sl = +1, i_up, rh, rl
        else:
            side, e_i, entry, sl = -1, i_dn, rl, rh
        tp = entry + side * cfg.target_r * size if cfg.target_r > 0 else None

        # entry bar: SL only (conservative)
        exit_px, exit_i, outcome = None, None, None
        if side > 0 and l[e_i] <= sl:
            exit_px, exit_i, outcome = sl, e_i, "sl"
        elif side < 0 and h[e_i] >= sl:
            exit_px, exit_i, outcome = sl, e_i, "sl"
        if exit_px is None:
            walk = sess[sess > e_i]
            for j in walk:
                hit_sl = (l[j] <= sl) if side > 0 else (h[j] >= sl)
                hit_tp = tp is not None and ((h[j] >= tp) if side > 0 else (l[j] <= tp))
                if hit_sl:                       # conservative: SL first
                    exit_px, exit_i, outcome = sl, j, "sl"
                    break
                if hit_tp:
                    exit_px, exit_i, outcome = tp, j, "tp"
                    break
            else:
                if len(walk):
                    exit_px, exit_i, outcome = c[walk[-1]], walk[-1], "time"
                else:
                    exit_px, exit_i, outcome = entry, e_i, "time"

        r_gross = side * (exit_px - entry) / size
        r_net = r_gross - cost / size
        rows.append(dict(day=day.date(), side=side, entry_time=times[e_i],
                         entry=entry, sl=sl, exit_time=times[exit_i],
                         exit=exit_px, range=size, outcome=outcome,
                         r_gross=r_gross, r_net=r_net))
    return pd.DataFrame(rows)


def stats(tr: pd.DataFrame, col: str) -> dict:
    if tr.empty:
        return dict(n=0, win=0.0, avg_r=0.0, total_r=0.0, pf=0.0, t=float("nan"),
                    dd=0.0)
    r = tr[col].to_numpy()
    pf = r[r > 0].sum() / abs(r[r < 0].sum()) if (r < 0).any() else float("inf")
    eq = np.concatenate([[0.0], r.cumsum()])
    dd = float((np.maximum.accumulate(eq) - eq).max())
    return dict(n=len(r), win=float((r > 0).mean() * 100), avg_r=float(r.mean()),
                total_r=float(r.sum()), pf=float(pf), t=tstat(r), dd=dd)


def fmt(s: dict) -> str:
    return (f"n={s['n']:>4} win={s['win']:5.1f}% avgR={s['avg_r']:+.4f} "
            f"totR={s['total_r']:+8.2f} PF={s['pf']:5.2f} t={s['t']:5.2f} "
            f"maxDD={s['dd']:6.1f}R")


def run_grid(y_from: int, y_to: int):
    cells = [
        ("03-08 / time-exit", OrbConfig(range_start=3, target_r=0.0)),
        ("03-08 / TP 1R    ", OrbConfig(range_start=3, target_r=1.0)),
        ("00-08 / time-exit", OrbConfig(range_start=0, target_r=0.0)),
        ("00-08 / TP 1R    ", OrbConfig(range_start=0, target_r=1.0)),
    ]
    print(f"\n=== ORB pre-registered 2x2 grid | {y_from}-{y_to} | NET ===")
    for sym in SYMBOLS:
        df = load_utc(sym, y_from, y_to)
        print(f"\n{sym}")
        for name, cfg in cells:
            tr = simulate_orb(df, sym, cfg)
            print(f"  {name} : {fmt(stats(tr, 'r_net'))}")


def run_years(y_from: int, y_to: int, cfg: OrbConfig):
    print(f"\n=== ORB frozen config, year-by-year | NET ===")
    for sym in SYMBOLS:
        print(f"\n{sym}")
        for y in range(y_from, y_to + 1):
            df = load_utc(sym, y, y)
            tr = simulate_orb(df, sym, cfg)
            print(f"  {y} : {fmt(stats(tr, 'r_net'))}")


def run_sensitivity(y_from: int, y_to: int):
    """Neighbourhood of the frozen config: the edge must not live on a point."""
    print(f"\n=== ORB sensitivity around frozen config | {y_from}-{y_to} | NET avgR ===")
    variants = {
        "base            ": FROZEN,
        "range 02-08     ": replace(FROZEN, range_start=2.0),
        "range 04-08     ": replace(FROZEN, range_start=4.0),
        "hunt to 10:00   ": replace(FROZEN, hunt_end=10.0),
        "hunt to 12:00   ": replace(FROZEN, hunt_end=12.0),
        "exit 16:00      ": replace(FROZEN, exit_hour=16.0),
        "exit 18:00      ": replace(FROZEN, exit_hour=18.0),
        "costs x1.5      ": replace(FROZEN, cost_mult=1.5),
        "costs x2        ": replace(FROZEN, cost_mult=2.0),
    }
    data = {sym: load_utc(sym, y_from, y_to) for sym in SYMBOLS}
    print(f"  {'variant':16} | " + " | ".join(f"{s:>8}" for s in SYMBOLS) + " | pooled")
    for name, cfg in variants.items():
        cols, pool = [], []
        for sym in SYMBOLS:
            tr = simulate_orb(data[sym], sym, cfg)
            cols.append(stats(tr, "r_net")["avg_r"])
            pool.append(tr["r_net"])
        pooled = float(pd.concat(pool).mean())
        print(f"  {name} | " + " | ".join(f"{v:+8.4f}" for v in cols)
              + f" | {pooled:+.4f}")


def run_volfilter(y_from: int, y_to: int):
    """Pre-registered volatility-filter test (addendum 2026-08-13).

    PRIMARY: vol_mult=1.0 (trade only if range >= trailing 20-day median).
    Secondary/sensitivity: 0.75, 1.25, and the cost-cap variant (0.05 R).
    Success bar (on fresh 2026 data): pooled NET avgR > 0 with the primary
    filter AND net-positive on >= 3 of 4 symbols.
    """
    variants = {
        "baseline (no filt)": FROZEN,
        "PRIMARY med x1.00 ": replace(FROZEN, vol_mult=1.00),
        "med x0.75         ": replace(FROZEN, vol_mult=0.75),
        "med x1.25         ": replace(FROZEN, vol_mult=1.25),
        "cost/range <= 0.05": replace(FROZEN, cost_cap=0.05),
    }
    print(f"\n=== ORB volatility-filter test | {y_from}-{y_to} | NET ===")
    data = {sym: load_utc(sym, y_from, y_to) for sym in SYMBOLS}
    for name, cfg in variants.items():
        print(f"\n[{name}]")
        pool = []
        pos = 0
        for sym in SYMBOLS:
            tr = simulate_orb(data[sym], sym, cfg)
            s = stats(tr, "r_net")
            if s["n"] > 0 and s["avg_r"] > 0:
                pos += 1
            pool.append(tr["r_net"] if not tr.empty else pd.Series(dtype=float))
            print(f"  {sym:7}: {fmt(s)}")
        pr = pd.concat(pool)
        print(f"  POOLED : n={len(pr)}  avgR={pr.mean():+.4f}  "
              f"t={tstat(pr.to_numpy()):.2f}  net-positive on {pos}/4 symbols")


def run_single(y_from: int, y_to: int, cfg: OrbConfig, png: bool, tag: str):
    print(f"\n=== ORB frozen config | {y_from}-{y_to} ===")
    all_tr = {}
    for sym in SYMBOLS:
        df = load_utc(sym, y_from, y_to)
        tr = simulate_orb(df, sym, cfg)
        all_tr[sym] = tr
        print(f"\n{sym}")
        print(f"  gross : {fmt(stats(tr, 'r_gross'))}")
        print(f"  net   : {fmt(stats(tr, 'r_net'))}")
        csv = os.path.join(OUT, f"orb_{sym}_{tag}_trades.csv")
        tr.to_csv(csv, index=False)
    pool = pd.concat([t["r_net"] for t in all_tr.values()])
    poolg = pd.concat([t["r_gross"] for t in all_tr.values()])
    print(f"\nPOOLED  gross avgR={poolg.mean():+.4f} (t={tstat(poolg.to_numpy()):.2f})"
          f"  net avgR={pool.mean():+.4f} (t={tstat(pool.to_numpy()):.2f})  n={len(pool)}")

    if png:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
        fig, axes = plt.subplots(2, 2, figsize=(13, 8))
        for ax, (sym, tr) in zip(axes.ravel(), all_tr.items()):
            for col, colr, lab in (("r_gross", "#999999", "gross"),
                                   ("r_net", "#1f77b4", "net")):
                eq = np.concatenate([[0.0], tr[col].cumsum().to_numpy()])
                ax.plot(eq, color=colr, lw=1.3, label=lab)
            ax.set_title(f"{sym}  ORB {tag}  (cum R, {y_from}-{y_to})")
            ax.grid(alpha=0.3)
            ax.legend()
        fig.tight_layout()
        p = os.path.join(OUT, f"orb_equity_{tag}.png")
        fig.savefig(p, dpi=110)
        print(f"saved {p}")


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--from", dest="y_from", type=int, default=2022)
    p.add_argument("--to", dest="y_to", type=int, default=2024)
    p.add_argument("--grid", action="store_true")
    p.add_argument("--years", action="store_true")
    p.add_argument("--sensitivity", action="store_true")
    p.add_argument("--volfilter", action="store_true")
    p.add_argument("--png", action="store_true")
    p.add_argument("--tag", default=None)
    a = p.parse_args()
    tag = a.tag or f"{a.y_from}_{a.y_to}"
    if a.grid:
        run_grid(a.y_from, a.y_to)
    elif a.years:
        run_years(a.y_from, a.y_to, FROZEN)
    elif a.sensitivity:
        run_sensitivity(a.y_from, a.y_to)
    elif a.volfilter:
        run_volfilter(a.y_from, a.y_to)
    else:
        run_single(a.y_from, a.y_to, FROZEN, a.png, tag)


if __name__ == "__main__":
    main()
