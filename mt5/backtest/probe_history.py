import MetaTrader5 as m
from datetime import datetime, timezone
import pandas as pd
import time

m.initialize()
for sym in ["EURUSD", "XAUUSD"]:
    m.symbol_select(sym, True)
    for a in ["2025-06-02", "2024-06-03", "2023-06-01"]:
        d = datetime.strptime(a, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        got = None
        for attempt in range(8):
            r = m.copy_rates_from(sym, m.TIMEFRAME_M1, d, 10)
            if r is not None and len(r) > 0:
                got = pd.to_datetime(r["time"], unit="s").min()
                break
            time.sleep(1.0)
        print(f"{sym:7} {a}: {'OK first='+str(got) if got is not None else 'FAIL '+str(m.last_error())} (tries={attempt+1})")
    print("-" * 55)
m.shutdown()
