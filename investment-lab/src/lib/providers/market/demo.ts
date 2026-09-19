import type {
  FundamentalsData,
  MarketBar,
  MarketProvider,
  MarketQuote,
} from "@/lib/providers/types";
import { UNIVERSE } from "@/lib/universe";

/** Deterministic pseudo-random from string */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seeded(symbol: string, dayIndex: number): number {
  const h = hash(`${symbol}:${dayIndex}`);
  return (h % 10000) / 10000;
}

function generateBars(
  symbol: string,
  from: string,
  to: string,
): MarketBar[] {
  const start = new Date(from + "T12:00:00Z");
  const end = new Date(to + "T12:00:00Z");
  const base = 50 + (hash(symbol) % 400);
  let price = base;
  const bars: MarketBar[] = [];
  let i = 0;
  const cur = new Date(start);
  while (cur <= end) {
    const day = cur.getUTCDay();
    if (day !== 0 && day !== 6) {
      const shock = (seeded(symbol, i) - 0.48) * 0.02;
      const open = price;
      const close = Math.max(1, price * (1 + shock));
      const high = Math.max(open, close) * (1 + seeded(symbol, i + 1) * 0.005);
      const low = Math.min(open, close) * (1 - seeded(symbol, i + 2) * 0.005);
      bars.push({
        date: cur.toISOString().slice(0, 10),
        open,
        high,
        low,
        close,
        volume: 1_000_000 + (hash(symbol + i) % 5_000_000),
      });
      price = close;
      i++;
    }
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return bars;
}

const FUNDAMENTALS: Record<string, FundamentalsData> = {
  AAPL: {
    symbol: "AAPL",
    peRatio: 28,
    profitMargin: 0.25,
    returnOnEquity: 1.5,
    avgVolume: 55_000_000,
  },
  MSFT: {
    symbol: "MSFT",
    peRatio: 32,
    profitMargin: 0.36,
    returnOnEquity: 0.35,
    avgVolume: 22_000_000,
  },
  GOOGL: {
    symbol: "GOOGL",
    peRatio: 24,
    profitMargin: 0.26,
    returnOnEquity: 0.3,
    avgVolume: 25_000_000,
  },
  AMZN: {
    symbol: "AMZN",
    peRatio: 40,
    profitMargin: 0.08,
    returnOnEquity: 0.2,
    avgVolume: 40_000_000,
  },
  NVDA: {
    symbol: "NVDA",
    peRatio: 55,
    profitMargin: 0.5,
    returnOnEquity: 1.0,
    avgVolume: 40_000_000,
  },
  "VWRL.L": {
    symbol: "VWRL.L",
    peRatio: null,
    expenseRatio: 0.0022,
    avgVolume: 200_000,
  },
  "CSPX.L": {
    symbol: "CSPX.L",
    expenseRatio: 0.0007,
    avgVolume: 150_000,
  },
  "EQQQ.L": {
    symbol: "EQQQ.L",
    expenseRatio: 0.003,
    avgVolume: 80_000,
  },
  "AGGU.L": {
    symbol: "AGGU.L",
    expenseRatio: 0.001,
    avgVolume: 50_000,
  },
  SPY: {
    symbol: "SPY",
    expenseRatio: 0.0009,
    avgVolume: 70_000_000,
  },
};

export class DemoMarketProvider implements MarketProvider {
  name = "demo";

  async getHistory(
    symbol: string,
    from: string,
    to: string,
  ): Promise<MarketBar[]> {
    return generateBars(symbol, from, to);
  }

  async getQuote(symbol: string): Promise<MarketQuote | null> {
    const to = new Date().toISOString().slice(0, 10);
    const fromDate = new Date();
    fromDate.setUTCDate(fromDate.getUTCDate() - 10);
    const from = fromDate.toISOString().slice(0, 10);
    const bars = await this.getHistory(symbol, from, to);
    const last = bars[bars.length - 1];
    if (!last) return null;
    const meta = UNIVERSE.find((u) => u.symbol === symbol);
    return {
      symbol,
      price: last.close,
      currency: meta?.currency ?? "USD",
      asOf: new Date(`${last.date}T16:00:00Z`).toISOString(),
      exchange: "DEMO",
    };
  }

  async getFundamentals(symbol: string): Promise<FundamentalsData | null> {
    return (
      FUNDAMENTALS[symbol] ?? {
        symbol,
        peRatio: null,
        profitMargin: null,
        returnOnEquity: null,
        expenseRatio: symbol.includes(".") ? 0.002 : null,
        avgVolume: 100_000,
      }
    );
  }
}
