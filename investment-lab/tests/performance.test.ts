import { describe, expect, it } from "vitest";
import {
  mwrCashflows,
  timeWeightedReturn,
  xirr,
} from "@/lib/performance/returns";
import { mirrorBenchmarkPortfolio } from "@/lib/performance/benchmark";
import type { CashFlowEvent } from "@/lib/portfolio/cashflows";

describe("cashflow TWR", () => {
  it("computes positive TWR with mid deposit", () => {
    const nav = [
      { date: "2026-01-01", value: 100 },
      { date: "2026-02-01", value: 110 },
      { date: "2026-03-01", value: 160 },
    ];
    const flows: CashFlowEvent[] = [
      { type: "deposit", amount: 50, occurredAt: "2026-03-01" },
    ];
    // Without adjusting: end 160 includes 50 deposit → subperiod ~0 then growth
    const twr = timeWeightedReturn(nav, flows);
    expect(twr).not.toBeNull();
    // First period +10%, second: (160-50)/110 - 1 = 0 → overall ~10%
    expect(twr!).toBeCloseTo(0.1, 5);
  });
});

describe("benchmark matching deposits", () => {
  it("mirrors deposits into benchmark share purchases", () => {
    const flows: CashFlowEvent[] = [
      { type: "deposit", amount: 100, occurredAt: "2025-01-02" },
      { type: "deposit", amount: 50, occurredAt: "2025-07-01" },
    ];
    const pricesByDate: Record<string, { open: number; close: number }> = {
      "2025-01-02": { open: 10, close: 10 },
      "2025-01-03": { open: 10, close: 11 },
      "2025-07-01": { open: 11, close: 12 },
      "2025-07-02": { open: 12, close: 12.5 },
    };
    const state = mirrorBenchmarkPortfolio({ flows, pricesByDate });
    expect(state.shares).toBeGreaterThan(0);
    expect(state.navSeries.length).toBeGreaterThan(0);
    const last = state.navSeries[state.navSeries.length - 1]!;
    expect(last.value).toBeGreaterThan(100);

    const mwr = xirr(mwrCashflows(flows, last.value, last.date));
    expect(mwr).not.toBeNull();
    expect(mwr!).toBeGreaterThan(-1);
  });
});
