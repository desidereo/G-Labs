import { describe, expect, it } from "vitest";
import {
  assertNotPriorCloseFill,
  resolveFillDate,
  simulatePaperFill,
} from "@/lib/portfolio/execution";
import { nextTradingDayForSymbol } from "@/lib/providers/calendar/exchange";

describe("execution next-session fill", () => {
  it("fills on next trading session, not decision day after hours", () => {
    const decisionAt = "2026-09-18T21:30:00.000Z"; // Thursday evening
    const fillDate = resolveFillDate({
      symbol: "AAPL",
      decisionAt,
      sameDaySessionClosed: true,
    });
    expect(fillDate).not.toBe("2026-09-18");
    expect(fillDate).toBe(
      nextTradingDayForSymbol("2026-09-19", "AAPL"),
    );

    const opensByDate: Record<string, number> = {
      [fillDate]: 200,
    };
    const fill = simulatePaperFill({
      symbol: "AAPL",
      side: "buy",
      notional: 100,
      decisionAt,
      opensByDate,
      quoteCurrency: "USD",
      sameDaySessionClosed: true,
    });
    expect(fill.executedAt).toBe(fillDate);
    expect(fill.fillSource).toBe("next_session_open");
    expect(fill.fillPrice).toBeGreaterThan(200); // buy slippage above open
  });

  it("rejects same-day prior-close style fills after hours", () => {
    expect(() =>
      assertNotPriorCloseFill({
        decisionAt: "2026-09-18T21:30:00Z",
        executedAt: "2026-09-18",
        fillPrice: 199,
        priorClose: 199,
        sameDaySessionClosed: true,
      }),
    ).toThrow(/Illegal fill/);
  });
});
