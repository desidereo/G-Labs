"""
Fetch additional Dukascopy M1 history into duka_cache/ (UTC, bid side).

Cache format matches validate_dukascopy.py: one CSV per symbol-year, raw
Dukascopy frame (UTC tz-aware index). Conversion to IC server time happens
at load time, not here.

Usage:
    python fetch_duka.py --symbols GBPUSD USDJPY --from 2022 --to 2025
"""

import argparse
import os
from datetime import datetime

import dukascopy_python as dk
from dukascopy_python.instruments import (
    INSTRUMENT_FX_MAJORS_EUR_USD,
    INSTRUMENT_FX_MAJORS_GBP_USD,
    INSTRUMENT_FX_MAJORS_USD_JPY,
    INSTRUMENT_FX_METALS_XAU_USD,
)

CACHE = os.path.join(os.path.dirname(__file__), "duka_cache")
os.makedirs(CACHE, exist_ok=True)

INSTRUMENTS = {
    "EURUSD": INSTRUMENT_FX_MAJORS_EUR_USD,
    "GBPUSD": INSTRUMENT_FX_MAJORS_GBP_USD,
    "USDJPY": INSTRUMENT_FX_MAJORS_USD_JPY,
    "XAUUSD": INSTRUMENT_FX_METALS_XAU_USD,
}


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--symbols", nargs="+", default=["GBPUSD", "USDJPY"])
    p.add_argument("--from", dest="y_from", type=int, default=2022)
    p.add_argument("--to", dest="y_to", type=int, default=2025)
    a = p.parse_args()

    for sym in a.symbols:
        inst = INSTRUMENTS[sym]
        for year in range(a.y_from, a.y_to + 1):
            path = os.path.join(CACHE, f"{sym}_{year}.csv")
            if os.path.exists(path):
                print(f"skip   {sym} {year} (cached)", flush=True)
                continue
            print(f"fetch  {sym} {year} ...", flush=True)
            df = dk.fetch(inst, dk.INTERVAL_MIN_1, dk.OFFER_SIDE_BID,
                          datetime(year, 1, 1), datetime(year + 1, 1, 1))
            if df is None or df.empty:
                print(f"  no data for {sym} {year}", flush=True)
                continue
            df.to_csv(path)
            print(f"  saved {len(df):,} rows -> {path}", flush=True)
    print("DONE_FETCH", flush=True)


if __name__ == "__main__":
    main()
