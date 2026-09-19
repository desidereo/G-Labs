/**
 * Initial investable universe for G Labs Investment Lab.
 *
 * Selection rationale (hypotheses, not edges):
 * - US mega-caps: liquid, ADR-friendly thinking for UK retail brokers, rich Yahoo coverage.
 * - UCITS ETFs (.L): UK retail-friendly wrappers on LSE; brokerAvailable=true for primary tickers.
 * - US ticker aliases (SPY, VTI, etc.): mapped for data/benchmark comparison; brokerAvailable=false
 *   when they are not the intended UK-investable vehicle (UK investors typically use UCITS).
 * - Benchmark: VWRL.L (Vanguard FTSE All-World UCITS) is the primary paper benchmark.
 *   Yahoo often lists VWRL.L; if unavailable at runtime, pipeline may fall back to VWRA.L / URTH.
 */

export type AssetClass = "stock" | "etf";

export interface UniverseInstrument {
  symbol: string;
  name: string;
  assetClass: AssetClass;
  currency: string;
  region: string;
  brokerAvailable: boolean;
  sector: string | null;
  /** Yahoo Finance symbol if different from symbol */
  yahooSymbol?: string;
  /** Optional alias group (e.g. all-world) */
  benchmarkAlias?: string;
  notes?: string;
}

export const BENCHMARK_SYMBOL = "VWRL.L";
export const BENCHMARK_FALLBACKS = ["VWRA.L", "URTH", "ACWI"] as const;

export const UNIVERSE: UniverseInstrument[] = [
  // ── Stocks (liquid US) ──────────────────────────────────────────────────
  {
    symbol: "AAPL",
    name: "Apple Inc.",
    assetClass: "stock",
    currency: "USD",
    region: "US",
    brokerAvailable: true,
    sector: "Technology",
  },
  {
    symbol: "MSFT",
    name: "Microsoft Corporation",
    assetClass: "stock",
    currency: "USD",
    region: "US",
    brokerAvailable: true,
    sector: "Technology",
  },
  {
    symbol: "GOOGL",
    name: "Alphabet Inc. Class A",
    assetClass: "stock",
    currency: "USD",
    region: "US",
    brokerAvailable: true,
    sector: "Communication Services",
  },
  {
    symbol: "AMZN",
    name: "Amazon.com Inc.",
    assetClass: "stock",
    currency: "USD",
    region: "US",
    brokerAvailable: true,
    sector: "Consumer Cyclical",
  },
  {
    symbol: "NVDA",
    name: "NVIDIA Corporation",
    assetClass: "stock",
    currency: "USD",
    region: "US",
    brokerAvailable: true,
    sector: "Technology",
  },
  // ── UCITS / UK-retail ETFs (LSE) ────────────────────────────────────────
  {
    symbol: "VWRL.L",
    name: "Vanguard FTSE All-World UCITS ETF",
    assetClass: "etf",
    currency: "GBP",
    region: "UK",
    brokerAvailable: true,
    sector: "Broad Market",
    benchmarkAlias: "all_world",
    notes: "Primary benchmark & investable all-world core",
  },
  {
    symbol: "VWRP.L",
    name: "Vanguard FTSE All-World UCITS ETF Acc",
    assetClass: "etf",
    currency: "GBP",
    region: "UK",
    brokerAvailable: true,
    sector: "Broad Market",
    benchmarkAlias: "all_world_acc",
  },
  {
    symbol: "CSPX.L",
    name: "iShares Core S&P 500 UCITS ETF",
    assetClass: "etf",
    currency: "USD",
    region: "UK",
    brokerAvailable: true,
    sector: "US Large Cap",
  },
  {
    symbol: "EQQQ.L",
    name: "Invesco EQQQ Nasdaq-100 UCITS ETF",
    assetClass: "etf",
    currency: "USD",
    region: "UK",
    brokerAvailable: true,
    sector: "US Tech",
  },
  {
    symbol: "AGGU.L",
    name: "iShares Core Global Aggregate Bond UCITS ETF",
    assetClass: "etf",
    currency: "USD",
    region: "UK",
    brokerAvailable: true,
    sector: "Fixed Income",
  },
  // ── US aliases (data / comparison; not primary UK vehicles) ─────────────
  {
    symbol: "SPY",
    name: "SPDR S&P 500 ETF Trust",
    assetClass: "etf",
    currency: "USD",
    region: "US",
    brokerAvailable: false,
    sector: "US Large Cap",
    notes: "US-listed S&P 500 reference; prefer CSPX.L for UK retail",
  },
  {
    symbol: "URTH",
    name: "iShares MSCI World ETF",
    assetClass: "etf",
    currency: "USD",
    region: "US",
    brokerAvailable: false,
    sector: "Broad Market",
    benchmarkAlias: "all_world_fallback",
    notes: "Fallback world proxy if VWRL.L Yahoo history fails",
  },
];

export function getUniverseSymbols(opts?: {
  brokerOnly?: boolean;
  assetClass?: AssetClass;
}): string[] {
  return UNIVERSE.filter((i) => {
    if (opts?.brokerOnly && !i.brokerAvailable) return false;
    if (opts?.assetClass && i.assetClass !== opts.assetClass) return false;
    return true;
  }).map((i) => i.symbol);
}

export function findInstrument(symbol: string): UniverseInstrument | undefined {
  return UNIVERSE.find(
    (i) => i.symbol === symbol || i.yahooSymbol === symbol,
  );
}
