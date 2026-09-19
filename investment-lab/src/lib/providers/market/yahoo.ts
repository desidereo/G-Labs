import type {
  FundamentalsData,
  MarketBar,
  MarketProvider,
  MarketQuote,
} from "@/lib/providers/types";
import { isPriceStale } from "@/lib/providers/calendar/exchange";

type YahooModule = {
  default?: {
    historical: (
      symbol: string,
      opts: { period1: Date | string; period2?: Date | string; interval?: string },
    ) => Promise<
      Array<{
        date: Date;
        open: number;
        high: number;
        low: number;
        close: number;
        volume: number;
      }>
    >;
    quote: (symbols: string | string[]) => Promise<
      Array<{
        symbol: string;
        regularMarketPrice?: number;
        currency?: string;
        regularMarketTime?: Date;
        fullExchangeName?: string;
        averageDailyVolume3Month?: number;
        trailingPE?: number;
        profitMargins?: number;
        returnOnEquity?: number;
      }>
    >;
  };
  historical?: YahooModule["default"] extends infer D
    ? D extends { historical: infer H }
      ? H
      : never
    : never;
};

async function loadYahoo(): Promise<{
  historical: NonNullable<YahooModule["default"]>["historical"];
  quote: NonNullable<YahooModule["default"]>["quote"];
}> {
  const mod = (await import("yahoo-finance2")) as YahooModule & {
    default?: unknown;
  };
  // yahoo-finance2 v3+/v4 may export differently
  const yf = (mod as { default?: typeof mod }).default ?? mod;
  const anyYf = yf as {
    historical: NonNullable<YahooModule["default"]>["historical"];
    quote: NonNullable<YahooModule["default"]>["quote"];
  };
  return anyYf;
}

function barDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export class YahooMarketProvider implements MarketProvider {
  name = "yahoo";

  async getHistory(
    symbol: string,
    from: string,
    to: string,
  ): Promise<MarketBar[]> {
    const yf = await loadYahoo();
    const rows = await yf.historical(symbol, {
      period1: from,
      period2: to,
      interval: "1d",
    });
    return (rows ?? [])
      .filter((r) => r && r.close != null)
      .map((r) => ({
        date: barDate(new Date(r.date)),
        open: Number(r.open),
        high: Number(r.high),
        low: Number(r.low),
        close: Number(r.close),
        volume: Number(r.volume ?? 0),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  async getQuote(symbol: string): Promise<MarketQuote | null> {
    const yf = await loadYahoo();
    const rows = await yf.quote(symbol);
    const q = Array.isArray(rows) ? rows[0] : rows;
    if (!q || q.regularMarketPrice == null) return null;
    const asOf = q.regularMarketTime
      ? new Date(q.regularMarketTime).toISOString()
      : new Date().toISOString();
    return {
      symbol: q.symbol ?? symbol,
      price: Number(q.regularMarketPrice),
      currency: q.currency,
      asOf,
      exchange: q.fullExchangeName,
    };
  }

  async getFundamentals(symbol: string): Promise<FundamentalsData | null> {
    try {
      const yf = await loadYahoo();
      const rows = await yf.quote(symbol);
      const q = Array.isArray(rows) ? rows[0] : rows;
      if (!q) return null;
      return {
        symbol,
        peRatio: q.trailingPE ?? null,
        profitMargin: q.profitMargins ?? null,
        returnOnEquity: q.returnOnEquity ?? null,
        expenseRatio: null, // not reliably on quote; leave missing
        avgVolume: q.averageDailyVolume3Month ?? null,
      };
    } catch {
      return null;
    }
  }
}

export function checkYahooFreshness(
  symbol: string,
  bars: MarketBar[],
  asOf = new Date(),
) {
  const last = bars.length ? bars[bars.length - 1]!.date : null;
  return isPriceStale({ lastBarDate: last, symbol, asOf });
}
