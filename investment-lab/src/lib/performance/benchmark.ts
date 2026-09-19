/**
 * Mirror deposits/withdrawals into a benchmark portfolio that buys the benchmark ETF.
 * Label remains "benchmark" — never join with live_paper / backtest curves.
 */

import type { CashFlowEvent } from "@/lib/portfolio/cashflows";
import { signedCashFlow } from "@/lib/portfolio/cashflows";
import type { NavPoint } from "./returns";
import { timeWeightedReturn } from "./returns";

export interface BenchmarkMirrorInput {
  flows: CashFlowEvent[];
  /** Benchmark ETF open/close by date */
  pricesByDate: Record<string, { open: number; close: number }>;
  startingCash?: number;
  /** Buy at next available open on/after flow date */
  fillAt?: "open" | "close";
}

export interface BenchmarkState {
  shares: number;
  cash: number;
  navSeries: NavPoint[];
}

/**
 * On each deposit, buy benchmark with available cash at next price.
 * Withdrawals sell shares pro-rata at next price.
 */
export function mirrorBenchmarkPortfolio(
  input: BenchmarkMirrorInput,
): BenchmarkState {
  const fillAt = input.fillAt ?? "open";
  let shares = 0;
  let cash = input.startingCash ?? 0;
  const navSeries: NavPoint[] = [];

  const dates = [
    ...new Set([
      ...Object.keys(input.pricesByDate),
      ...input.flows.map((f) => f.occurredAt.slice(0, 10)),
    ]),
  ].sort();

  const flowsByDate = new Map<string, CashFlowEvent[]>();
  for (const f of input.flows) {
    const d = f.occurredAt.slice(0, 10);
    const list = flowsByDate.get(d) ?? [];
    list.push(f);
    flowsByDate.set(d, list);
  }

  for (const date of dates) {
    const px = input.pricesByDate[date];
    const dayFlows = flowsByDate.get(date) ?? [];
    for (const f of dayFlows) {
      cash += signedCashFlow(f);
    }

    if (px) {
      const tradePx = fillAt === "open" ? px.open : px.close;
      if (tradePx > 0) {
        if (cash > 0) {
          const buy = cash / tradePx;
          shares += buy;
          cash = 0;
        } else if (cash < 0 && shares > 0) {
          const need = -cash;
          const sellShares = Math.min(shares, need / tradePx);
          shares -= sellShares;
          cash += sellShares * tradePx;
        }
      }
      navSeries.push({
        date,
        value: shares * px.close + cash,
      });
    }
  }

  return { shares, cash, navSeries };
}

export function benchmarkTwr(
  flows: CashFlowEvent[],
  pricesByDate: Record<string, { open: number; close: number }>,
): number | null {
  const { navSeries } = mirrorBenchmarkPortfolio({ flows, pricesByDate });
  return timeWeightedReturn(navSeries, flows);
}
