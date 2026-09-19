/**
 * Deterministic numerical scoring — STRATEGY_VERSION 0.1.0
 * Pure functions; missing inputs reduce dataQuality and may force insufficient_evidence.
 */

export const STRATEGY_VERSION = "0.1.0";

export interface PricePoint {
  date: string; // YYYY-MM-DD
  close: number;
}

export interface FundamentalsStub {
  peRatio?: number | null;
  profitMargin?: number | null;
  returnOnEquity?: number | null;
  expenseRatio?: number | null;
  avgVolume?: number | null;
}

export interface ComponentScores {
  momentum: number | null;
  quality: number | null;
  valuation: number | null;
  volatility: number | null;
  liquidity: number | null;
  relativeStrength: number | null;
  expense: number | null;
}

export interface DataQuality {
  coverage: number; // 0-1
  missingFields: string[];
  stale: boolean;
  notes: string[];
}

export interface ScoreInput {
  symbol: string;
  assetClass: "stock" | "etf";
  bars: PricePoint[];
  fundamentals?: FundamentalsStub;
  benchmarkBars?: PricePoint[];
  stale?: boolean;
}

export interface ScoreResult {
  symbol: string;
  assetClass: "stock" | "etf";
  overallScore: number;
  componentScores: ComponentScores;
  dataQuality: DataQuality;
  action: "hold" | "watch" | "buy" | "insufficient_evidence" | "no_change";
}

const STOCK_WEIGHTS = {
  momentum: 0.35,
  quality: 0.2,
  valuation: 0.15,
  volatility: 0.15,
  liquidity: 0.15,
} as const;

const ETF_WEIGHTS = {
  momentum: 0.3,
  volatility: 0.2,
  expense: 0.15,
  liquidity: 0.15,
  relativeStrength: 0.2,
} as const;

/** Return over approx trading days lookback (252 ~ 1y). */
export function momentumReturn(
  bars: PricePoint[],
  lookbackTradingDays: number,
): number | null {
  if (bars.length < lookbackTradingDays + 1) return null;
  const sorted = [...bars].sort((a, b) => a.date.localeCompare(b.date));
  const end = sorted[sorted.length - 1]!;
  const start = sorted[sorted.length - 1 - lookbackTradingDays]!;
  if (!start || start.close <= 0) return null;
  return (end.close - start.close) / start.close;
}

export function combinedMomentum(bars: PricePoint[]): number | null {
  const m3 = momentumReturn(bars, 63);
  const m6 = momentumReturn(bars, 126);
  const m12 = momentumReturn(bars, 252);
  const parts = [m3, m6, m12].filter((x): x is number => x !== null);
  if (parts.length === 0) return null;
  // Prefer longer horizons slightly when present
  const weights =
    parts.length === 3
      ? [0.2, 0.3, 0.5]
      : parts.map(() => 1 / parts.length);
  const raw = parts.reduce((s, v, i) => s + v * (weights[i] ?? 0), 0);
  return clamp01(rankLikeReturn(raw));
}

/** Map raw return (~ -50%..+50%) to 0-100-ish via logistic-ish clamp. */
function rankLikeReturn(r: number): number {
  // map -0.4 → ~20, 0 → 50, +0.4 → ~80
  return 50 + r * 75;
}

export function annualizedVolatility(bars: PricePoint[]): number | null {
  if (bars.length < 22) return null;
  const sorted = [...bars].sort((a, b) => a.date.localeCompare(b.date));
  const rets: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!.close;
    const cur = sorted[i]!.close;
    if (prev > 0) rets.push(Math.log(cur / prev));
  }
  if (rets.length < 20) return null;
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const var_ =
    rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length - 1);
  return Math.sqrt(var_) * Math.sqrt(252);
}

/** Lower vol → higher score. */
export function volatilityScore(bars: PricePoint[]): number | null {
  const vol = annualizedVolatility(bars);
  if (vol === null) return null;
  // 10% vol → ~80, 40% → ~20
  return clamp01(100 - vol * 150);
}

export function downsideDeviation(bars: PricePoint[]): number | null {
  if (bars.length < 22) return null;
  const sorted = [...bars].sort((a, b) => a.date.localeCompare(b.date));
  const neg: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!.close;
    const cur = sorted[i]!.close;
    if (prev > 0) {
      const r = Math.log(cur / prev);
      if (r < 0) neg.push(r);
    }
  }
  if (neg.length < 5) return null;
  const var_ = neg.reduce((a, b) => a + b ** 2, 0) / neg.length;
  return Math.sqrt(var_) * Math.sqrt(252);
}

export function qualityScore(f?: FundamentalsStub): number | null {
  if (!f) return null;
  const parts: number[] = [];
  if (f.profitMargin != null && Number.isFinite(f.profitMargin)) {
    parts.push(clamp01(50 + f.profitMargin * 200));
  }
  if (f.returnOnEquity != null && Number.isFinite(f.returnOnEquity)) {
    parts.push(clamp01(50 + f.returnOnEquity * 100));
  }
  if (parts.length === 0) return null;
  return parts.reduce((a, b) => a + b, 0) / parts.length;
}

export function valuationScore(f?: FundamentalsStub): number | null {
  if (!f || f.peRatio == null || !Number.isFinite(f.peRatio) || f.peRatio <= 0) {
    return null;
  }
  // Lower PE → higher score; PE 15 → ~70, PE 40 → ~30
  return clamp01(100 - Math.log(f.peRatio) * 25);
}

export function liquidityScore(f?: FundamentalsStub): number | null {
  if (!f || f.avgVolume == null || !Number.isFinite(f.avgVolume)) return null;
  // log scale: 1e5 → ~40, 1e7 → ~80
  const logv = Math.log10(Math.max(f.avgVolume, 1));
  return clamp01((logv - 4) * 25);
}

export function expenseScore(f?: FundamentalsStub): number | null {
  if (!f || f.expenseRatio == null || !Number.isFinite(f.expenseRatio)) {
    return null;
  }
  // 0.07% → high, 0.75% → low (ratio as decimal e.g. 0.0022)
  return clamp01(100 - f.expenseRatio * 8000);
}

export function relativeStrengthScore(
  bars: PricePoint[],
  benchmarkBars: PricePoint[],
): number | null {
  const asset = momentumReturn(bars, 126);
  const bench = momentumReturn(benchmarkBars, 126);
  if (asset === null || bench === null) return null;
  const excess = asset - bench;
  return clamp01(50 + excess * 100);
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(100, n));
}

function weightedMean(
  entries: Array<{ score: number | null; weight: number; field: string }>,
): { score: number; usedWeight: number; missing: string[] } {
  const missing: string[] = [];
  let num = 0;
  let den = 0;
  for (const e of entries) {
    if (e.score === null) {
      missing.push(e.field);
      continue;
    }
    num += e.score * e.weight;
    den += e.weight;
  }
  if (den === 0) return { score: 0, usedWeight: 0, missing };
  return { score: num / den, usedWeight: den, missing };
}

export function scoreInstrument(input: ScoreInput): ScoreResult {
  const missingFields: string[] = [];
  const notes: string[] = [];
  const stale = Boolean(input.stale);

  const momentum = combinedMomentum(input.bars);
  const volatility = volatilityScore(input.bars);
  const liquidity = liquidityScore(input.fundamentals);

  let componentScores: ComponentScores = {
    momentum,
    quality: null,
    valuation: null,
    volatility,
    liquidity,
    relativeStrength: null,
    expense: null,
  };

  let overall: number;
  let coverage: number;

  if (input.assetClass === "stock") {
    const quality = qualityScore(input.fundamentals);
    const valuation = valuationScore(input.fundamentals);
    componentScores = {
      ...componentScores,
      quality,
      valuation,
    };
    const { score, usedWeight, missing } = weightedMean([
      { score: momentum, weight: STOCK_WEIGHTS.momentum, field: "momentum" },
      { score: quality, weight: STOCK_WEIGHTS.quality, field: "quality" },
      { score: valuation, weight: STOCK_WEIGHTS.valuation, field: "valuation" },
      { score: volatility, weight: STOCK_WEIGHTS.volatility, field: "volatility" },
      { score: liquidity, weight: STOCK_WEIGHTS.liquidity, field: "liquidity" },
    ]);
    missingFields.push(...missing);
    overall = score;
    coverage = usedWeight;
    const totalW = Object.values(STOCK_WEIGHTS).reduce((a, b) => a + b, 0);
    coverage = usedWeight / totalW;
  } else {
    const expense = expenseScore(input.fundamentals);
    const relativeStrength = input.benchmarkBars
      ? relativeStrengthScore(input.bars, input.benchmarkBars)
      : null;
    componentScores = {
      ...componentScores,
      expense,
      relativeStrength,
    };
    const { score, usedWeight, missing } = weightedMean([
      { score: momentum, weight: ETF_WEIGHTS.momentum, field: "momentum" },
      { score: volatility, weight: ETF_WEIGHTS.volatility, field: "volatility" },
      { score: expense, weight: ETF_WEIGHTS.expense, field: "expense" },
      { score: liquidity, weight: ETF_WEIGHTS.liquidity, field: "liquidity" },
      {
        score: relativeStrength,
        weight: ETF_WEIGHTS.relativeStrength,
        field: "relativeStrength",
      },
    ]);
    missingFields.push(...missing);
    const totalW = Object.values(ETF_WEIGHTS).reduce((a, b) => a + b, 0);
    coverage = usedWeight / totalW;
    overall = score;
  }

  if (stale) {
    notes.push("Price data flagged stale");
  }
  if (input.bars.length < 60) {
    notes.push("Short price history");
    missingFields.push("price_history_depth");
  }

  const dataQuality: DataQuality = {
    coverage,
    missingFields: [...new Set(missingFields)],
    stale,
    notes,
  };

  const action = decideAction(overall, dataQuality);

  return {
    symbol: input.symbol,
    assetClass: input.assetClass,
    overallScore: Math.round(overall * 100) / 100,
    componentScores,
    dataQuality,
    action,
  };
}

export function decideAction(
  overallScore: number,
  dq: DataQuality,
): ScoreResult["action"] {
  if (dq.stale || dq.coverage < 0.4 || dq.missingFields.includes("momentum")) {
    return "insufficient_evidence";
  }
  if (overallScore >= 70 && dq.coverage >= 0.7) return "buy";
  if (overallScore >= 55) return "watch";
  if (overallScore >= 40) return "hold";
  return "no_change";
}

/** Relative rank scores 0-100 across a peer set (percentile of overall). */
export function relativeRankScores(results: ScoreResult[]): ScoreResult[] {
  const eligible = results.filter((r) => r.action !== "insufficient_evidence");
  if (eligible.length === 0) return results;
  const sorted = [...eligible].sort(
    (a, b) => a.overallScore - b.overallScore,
  );
  const rankMap = new Map<string, number>();
  sorted.forEach((r, i) => {
    const pct =
      eligible.length === 1 ? 50 : (i / (eligible.length - 1)) * 100;
    rankMap.set(r.symbol, Math.round(pct * 100) / 100);
  });
  return results.map((r) => {
    const ranked = rankMap.get(r.symbol);
    if (ranked === undefined) return r;
    return { ...r, overallScore: ranked };
  });
}
