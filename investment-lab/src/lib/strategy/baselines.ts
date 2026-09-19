/**
 * Equal-weight and buy-and-hold benchmark helpers (pure).
 * Curves for backtest / live paper / user-entered must stay separately labelled.
 */

export type CurveLabel = "backtest" | "live_paper" | "user_entered" | "benchmark";

export interface LabeledPoint {
  date: string;
  value: number;
  label: CurveLabel;
}

export interface HoldingWeight {
  symbol: string;
  weight: number;
}

/** Equal weights summing to 1. */
export function equalWeights(symbols: string[]): HoldingWeight[] {
  if (symbols.length === 0) return [];
  const w = 1 / symbols.length;
  return symbols.map((symbol) => ({ symbol, weight: w }));
}

/**
 * Buy-and-hold growth of a single asset from an initial NAV.
 * prices: map date -> close; dates ascending.
 */
export function buyAndHoldSeries(
  initialNav: number,
  pricesByDate: Array<{ date: string; close: number }>,
  label: CurveLabel = "benchmark",
): LabeledPoint[] {
  if (pricesByDate.length === 0) return [];
  const sorted = [...pricesByDate].sort((a, b) =>
    a.date.localeCompare(b.date),
  );
  const first = sorted[0]!.close;
  if (first <= 0) return [];
  return sorted.map((p) => ({
    date: p.date,
    value: initialNav * (p.close / first),
    label,
  }));
}

/**
 * Equal-weight portfolio NAV assuming daily rebalance to equal weights.
 * prices: symbol -> sorted bars.
 */
export function equalWeightRebalancedSeries(
  initialNav: number,
  symbols: string[],
  prices: Record<string, Array<{ date: string; close: number }>>,
  label: CurveLabel = "backtest",
): LabeledPoint[] {
  if (symbols.length === 0) return [];
  const dateSet = new Set<string>();
  for (const s of symbols) {
    for (const b of prices[s] ?? []) dateSet.add(b.date);
  }
  const dates = [...dateSet].sort();
  if (dates.length === 0) return [];

  const closeOn = (symbol: string, date: string): number | null => {
    const bars = prices[symbol] ?? [];
    const hit = bars.find((b) => b.date === date);
    return hit?.close ?? null;
  };

  let nav = initialNav;
  const out: LabeledPoint[] = [];
  for (let i = 0; i < dates.length; i++) {
    const d = dates[i]!;
    if (i === 0) {
      out.push({ date: d, value: nav, label });
      continue;
    }
    const prev = dates[i - 1]!;
    let growth = 0;
    let counted = 0;
    for (const s of symbols) {
      const c0 = closeOn(s, prev);
      const c1 = closeOn(s, d);
      if (c0 && c1 && c0 > 0) {
        growth += c1 / c0;
        counted++;
      }
    }
    if (counted > 0) {
      nav *= growth / counted;
    }
    out.push({ date: d, value: nav, label });
  }
  return out;
}

/** Never join differently labelled curves into one series. */
export function assertSeparateLabels(points: LabeledPoint[]): void {
  const labels = new Set(points.map((p) => p.label));
  if (labels.size > 1) {
    throw new Error(
      `Refusing to join curves with mixed labels: ${[...labels].join(", ")}`,
    );
  }
}
