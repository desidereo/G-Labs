"""
Robustness check for the RSI + FVG confirmation filter.

Fetches each symbol's M1 history once, then runs the baseline (no RSI) plus a
grid of RSI timeframes/thresholds so we can see whether the RSI+FVG edge is
consistent across instruments and settings (robust) or only shows up at a
single lucky point (fragile / curve-fit).
"""

import copy
from datetime import datetime

import backtest_sweep_fvg as bt


SYMBOLS = ["EURUSD", "USTEC", "US30", "XAUUSD"]
DATE_FROM = datetime(2026, 5, 1)
DATE_TO = datetime(2026, 8, 11)

RSI_TFS = [5, 15]
THRESHOLDS = [(25, 75), (30, 70), (35, 65)]


def run():
    bt.init_mt5()
    print(f"\n{'symbol':7} {'filter':16} {'trades':>6} {'win%':>6} "
          f"{'totalR':>8} {'PF':>6} {'avgR':>7} {'maxDDr':>7}")
    print("-" * 70)

    for sym in SYMBOLS:
        symbol = bt.resolve_symbol(sym)
        info = bt.mt5.symbol_info(symbol)
        df = bt.fetch_m1(symbol, DATE_FROM, DATE_TO)

        base = bt.Config(symbol=symbol, date_from=DATE_FROM, date_to=DATE_TO,
                         rr=2.0, risk_percent=1.0)
        base.point = info.point

        def show(label, cfg):
            s = bt.compute_stats(bt.simulate(df, cfg))
            pf = s["pf"]
            pf_s = "inf" if pf == float("inf") else f"{pf:.2f}"
            print(f"{symbol:7} {label:16} {s['trades']:>6} {s['win_rate']:>6.1f} "
                  f"{s['total_r']:>+8.2f} {pf_s:>6} {s['avg_r']:>+7.3f} "
                  f"{s['max_dd_r']:>7.2f}")

        show("baseline", base)
        for tf in RSI_TFS:
            for os_, ob in THRESHOLDS:
                cfg = copy.copy(base)
                cfg.use_rsi = True
                cfg.rsi_tf = tf
                cfg.rsi_os = os_
                cfg.rsi_ob = ob
                show(f"RSI M{tf} {os_}/{ob}", cfg)
        print("-" * 70)

    bt.mt5.shutdown()


if __name__ == "__main__":
    run()
