import { describe, expect, it } from "vitest";
import { isPriceStale } from "@/lib/providers/calendar/exchange";
import {
  parseAiSynthesis,
  safeParseAiSynthesis,
} from "@/lib/providers/ai/types";
import { DemoAiProvider } from "@/lib/providers/ai/demo";

describe("stale data withholding", () => {
  it("flags bars older than 3 trading days as stale", () => {
    const result = isPriceStale({
      lastBarDate: "2026-09-10",
      asOf: new Date("2026-09-18T15:00:00Z"),
      symbol: "AAPL",
      maxAgeTradingDays: 3,
    });
    expect(result.stale).toBe(true);
  });

  it("accepts fresh last bar", () => {
    const result = isPriceStale({
      lastBarDate: "2026-09-17",
      asOf: new Date("2026-09-18T15:00:00Z"),
      symbol: "AAPL",
      maxAgeTradingDays: 3,
    });
    expect(result.stale).toBe(false);
  });
});

describe("AI schema validation", () => {
  it("rejects malformed synthesis", () => {
    const bad = safeParseAiSynthesis({
      symbol: "AAPL",
      rationale: "x",
      // risks missing
    });
    expect(bad.success).toBe(false);
  });

  it("accepts valid synthesis and demo provider labels synthetic", async () => {
    const parsed = parseAiSynthesis({
      symbol: "AAPL",
      rationale: "ok",
      risks: ["r"],
      invalidation: "i",
      evidence: [{ claim: "c" }],
      catalysts: [],
      synthetic: true,
    });
    expect(parsed.symbol).toBe("AAPL");

    const demo = new DemoAiProvider();
    const result = await demo.synthesise({
      symbol: "MSFT",
      scores: {},
      dataQuality: { coverage: 0.9, missingFields: [] },
    });
    expect(result.synthesis.synthetic).toBe(true);
    expect(result.synthesis.rationale).toContain("SYNTHETIC DEMO");
  });
});
