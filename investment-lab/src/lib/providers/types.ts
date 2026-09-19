export interface MarketBar {
  date: string; // YYYY-MM-DD
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface MarketQuote {
  symbol: string;
  price: number;
  currency?: string;
  asOf: string; // ISO
  exchange?: string;
}

export interface FundamentalsData {
  symbol: string;
  peRatio?: number | null;
  profitMargin?: number | null;
  returnOnEquity?: number | null;
  expenseRatio?: number | null;
  avgVolume?: number | null;
  sector?: string | null;
}

export interface FreshnessResult {
  stale: boolean;
  asOf: string | null;
  reason?: string;
}

export interface MarketProvider {
  name: string;
  getHistory(
    symbol: string,
    from: string,
    to: string,
  ): Promise<MarketBar[]>;
  getQuote(symbol: string): Promise<MarketQuote | null>;
  getFundamentals(symbol: string): Promise<FundamentalsData | null>;
}

export interface NewsStub {
  symbol: string;
  title: string;
  url?: string;
  publishedAt?: string;
  source?: string;
}
