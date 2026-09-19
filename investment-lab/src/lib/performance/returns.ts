/**
 * Performance metrics: TWR, MWR/XIRR, max drawdown, volatility, excess vs benchmark.
 * Pure functions — do not join differently labelled curves.
 */

import type { CashFlowEvent } from "@/lib/portfolio/cashflows";
import { signedCashFlow } from "@/lib/portfolio/cashflows";

export interface NavPoint {
  date: string;
  value: number;
}

/** Time-weighted return between NAV points with optional external flows on dates. */
export function timeWeightedReturn(
  navSeries: NavPoint[],
  flows: CashFlowEvent[] = [],
): number | null {
  if (navSeries.length < 2) return null;
  const sorted = [...navSeries].sort((a, b) => a.date.localeCompare(b.date));
  const flowsByDate = new Map<string, number>();
  for (const f of flows) {
    const d = f.occurredAt.slice(0, 10);
    flowsByDate.set(d, (flowsByDate.get(d) ?? 0) + signedCashFlow(f));
  }

  let twr = 1;
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!;
    const cur = sorted[i]!;
    const flow = flowsByDate.get(cur.date) ?? 0;
    // Diluted begin: if flow at start of day, subtract from end for sub-period
    const startNav = prev.value;
    if (startNav <= 0) continue;
    const endBeforeFlow = cur.value - flow;
    const r = endBeforeFlow / startNav - 1;
    twr *= 1 + r;
  }
  return twr - 1;
}

/** Newton / bisection XIRR (MWR). Returns null if invalid. */
export function xirr(
  cashflows: Array<{ date: string; amount: number }>,
  guess = 0.1,
): number | null {
  if (cashflows.length < 2) return null;
  const sorted = [...cashflows].sort((a, b) => a.date.localeCompare(b.date));
  const hasPos = sorted.some((c) => c.amount > 0);
  const hasNeg = sorted.some((c) => c.amount < 0);
  if (!hasPos || !hasNeg) return null;

  const t0 = Date.parse(sorted[0]!.date);
  const years = (d: string) =>
    Math.max(
      (Date.parse(d) - t0) / (365.25 * 24 * 3600 * 1000),
      1 / 365.25,
    );

  const npv = (rate: number) =>
    sorted.reduce((s, c) => s + c.amount / Math.pow(1 + rate, years(c.date)), 0);

  // Bracket over a wide range for short-horizon / high-rate cases
  let lo = -0.9999;
  let hi = 1e6;
  let fLo = npv(lo);
  let fHi = npv(hi);
  if (fLo * fHi > 0) {
    // try alternate high bound
    hi = 100;
    fHi = npv(hi);
    if (fLo * fHi > 0) return null;
  }

  let rate = guess;
  for (let i = 0; i < 80; i++) {
    const f = npv(rate);
    if (Math.abs(f) < 1e-6) return rate;
    const f2 = npv(rate + 1e-8);
    const deriv = (f2 - f) / 1e-8;
    if (Math.abs(deriv) < 1e-14) break;
    const next = rate - f / deriv;
    if (!Number.isFinite(next) || next <= -1) break;
    rate = next;
  }

  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const fMid = npv(mid);
    if (Math.abs(fMid) < 1e-6) return mid;
    if (fLo * fMid <= 0) {
      hi = mid;
    } else {
      lo = mid;
      fLo = fMid;
    }
  }
  const mid = (lo + hi) / 2;
  return Number.isFinite(mid) ? mid : null;
}

export function maxDrawdown(navSeries: NavPoint[]): number | null {
  if (navSeries.length < 2) return null;
  const sorted = [...navSeries].sort((a, b) => a.date.localeCompare(b.date));
  let peak = sorted[0]!.value;
  let maxDd = 0;
  for (const p of sorted) {
    if (p.value > peak) peak = p.value;
    if (peak > 0) {
      const dd = (peak - p.value) / peak;
      if (dd > maxDd) maxDd = dd;
    }
  }
  return maxDd;
}

export function seriesVolatility(navSeries: NavPoint[]): number | null {
  if (navSeries.length < 3) return null;
  const sorted = [...navSeries].sort((a, b) => a.date.localeCompare(b.date));
  const rets: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1]!.value;
    const b = sorted[i]!.value;
    if (a > 0) rets.push(Math.log(b / a));
  }
  if (rets.length < 2) return null;
  const mean = rets.reduce((x, y) => x + y, 0) / rets.length;
  const v =
    rets.reduce((x, y) => x + (y - mean) ** 2, 0) / (rets.length - 1);
  return Math.sqrt(v) * Math.sqrt(252);
}

export function excessReturn(
  portfolioTwr: number | null,
  benchmarkTwr: number | null,
): number | null {
  if (portfolioTwr == null || benchmarkTwr == null) return null;
  return portfolioTwr - benchmarkTwr;
}

/** Build XIRR cashflows: negative deposits, positive final NAV (and withdrawals positive). */
export function mwrCashflows(
  flows: CashFlowEvent[],
  finalNav: number,
  finalDate: string,
): Array<{ date: string; amount: number }> {
  const cfs = flows.map((f) => ({
    date: f.occurredAt.slice(0, 10),
    // investor perspective: deposit is outflow (-)
    amount: f.type === "deposit" ? -Math.abs(f.amount) : Math.abs(f.amount),
  }));
  cfs.push({ date: finalDate.slice(0, 10), amount: finalNav });
  return cfs;
}
