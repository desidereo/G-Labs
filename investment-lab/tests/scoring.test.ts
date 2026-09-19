import { describe, expect, it } from "vitest";
import {
  decideAction,
  scoreInstrument,
  type ScoreInput,
} from "@/lib/strategy/scoring";
import type { PricePoint } from "@/lib/strategy/scoring";

function synthBars(
  n: number,
  start = 100,
  daily = 0.001,
): PricePoint[] {
  const bars: PricePoint[] = [];
  let p = start;
  const d = new Date("2024-01-02T12:00:00Z");
  for (let i = 0; i < n; i++) {
    while (d.getUTCDay() === 0 || d.getUTCDay() === 6) {
      d.setUTCDate(d.getUTCDate() + 1);
    }
    bars.push({ date: d.toISOString().slice(0, 10), close: p });
    p *= 1 + daily;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return bars;
}

describe("scoring missing data", () => {
  it("marks insufficient_evidence when stale or thin coverage", () => {
    const input: ScoreInput = {
      symbol: "TEST",
      assetClass: "stock",
      bars: synthBars(30),
      fundamentals: {},
      stale: true,
    };
    const result = scoreInstrument(input);
    expect(result.action).toBe("insufficient_evidence");
    expect(result.dataQuality.stale).toBe(true);
    expect(result.dataQuality.missingFields.length).toBeGreaterThan(0);
  });

  it("does not invent PE — valuation null when missing", () => {
    const result = scoreInstrument({
      symbol: "AAPL",
      assetClass: "stock",
      bars: synthBars(300, 100, 0.002),
      fundamentals: { avgVolume: 1_000_000 },
      stale: false,
    });
    expect(result.componentScores.valuation).toBeNull();
    expect(result.dataQuality.missingFields).toContain("valuation");
  });

  it("decideAction forces insufficient_evidence on low coverage", () => {
    expect(
      decideAction(80, {
        coverage: 0.2,
        missingFields: ["momentum"],
        stale: false,
        notes: [],
      }),
    ).toBe("insufficient_evidence");
  });
});
