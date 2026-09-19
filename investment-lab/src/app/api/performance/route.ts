import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db/client";
import { ensureTables } from "@/lib/db/migrate";
import { seedDemo } from "@/lib/db/seed";
import { cashFlows, portfolios, valuations } from "@/lib/db/schema";
import {
  maxDrawdown,
  mwrCashflows,
  seriesVolatility,
  timeWeightedReturn,
  xirr,
  excessReturn,
} from "@/lib/performance/returns";
import type { CashFlowEvent } from "@/lib/portfolio/cashflows";
import type { NavPoint } from "@/lib/performance/returns";

export const GET = auth(async () => {
  await ensureTables();
  await seedDemo();
  const db = getDb();
  const all = await db.query.portfolios.findMany();

  const byKind: Record<string, unknown> = {};

  for (const p of all) {
    const flows = await db.query.cashFlows.findMany({
      where: eq(cashFlows.portfolioId, p.id),
    });
    const vals = await db.query.valuations.findMany({
      where: eq(valuations.portfolioId, p.id),
      orderBy: (t, { asc }) => [asc(t.asOf)],
    });

    const cfEvents: CashFlowEvent[] = flows.map((f) => ({
      amount: f.amount,
      type: f.type,
      occurredAt: f.occurredAt,
    }));

    const nav: NavPoint[] =
      vals.length > 0
        ? vals.map((v) => ({ date: v.asOf.slice(0, 10), value: v.totalValue }))
        : [
            {
              date: new Date().toISOString().slice(0, 10),
              value: p.startingBalance,
            },
          ];

    const twr = timeWeightedReturn(nav, cfEvents);
    const last = nav[nav.length - 1]!;
    const mwr = xirr(mwrCashflows(cfEvents, last.value, last.date));

    byKind[p.kind] = {
      portfolioId: p.id,
      label:
        p.kind === "benchmark"
          ? "benchmark"
          : p.kind === "paper_model"
            ? "live_paper"
            : "user_entered",
      twr,
      mwr,
      maxDrawdown: maxDrawdown(nav),
      volatility: seriesVolatility(nav),
      navPoints: nav.length,
    };
  }

  const manual = byKind["paper_manual"] as { twr?: number | null } | undefined;
  const bench = byKind["benchmark"] as { twr?: number | null } | undefined;

  return NextResponse.json({
    series: byKind,
    excessVsBenchmark: excessReturn(
      manual?.twr ?? null,
      bench?.twr ?? null,
    ),
    note: "Curves are labelled separately; never joined across backtest/live_paper/user_entered/benchmark.",
  });
});
