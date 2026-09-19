import { NextResponse } from "next/server";
import { z } from "zod";
import { v4 as uuid } from "uuid";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db/client";
import { ensureTables } from "@/lib/db/migrate";
import {
  portfolios,
  recommendationDecisions,
  recommendations,
  transactions,
} from "@/lib/db/schema";
import { simulatePaperFill } from "@/lib/portfolio/execution";
import { getMarketProvider } from "@/lib/providers/market";
import { nextTradingDayForSymbol } from "@/lib/providers/calendar/exchange";
import { findInstrument } from "@/lib/universe";

const bodySchema = z.object({
  recommendationId: z.string().min(1),
  decision: z.enum(["accept", "reject"]),
  portfolioId: z.string().optional(),
  notional: z.number().positive().optional(),
  note: z.string().optional(),
});

export const POST = auth(async (req) => {
  await ensureTables();
  const json = await req.json();
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const data = parsed.data;
  const db = getDb();

  const rec = await db.query.recommendations.findFirst({
    where: eq(recommendations.id, data.recommendationId),
  });
  if (!rec) {
    return NextResponse.json(
      { error: "Recommendation not found" },
      { status: 404 },
    );
  }

  const manual =
    (data.portfolioId
      ? await db.query.portfolios.findFirst({
          where: eq(portfolios.id, data.portfolioId),
        })
      : await db.query.portfolios.findFirst({
          where: eq(portfolios.kind, "paper_manual"),
        })) ?? null;

  const decisionId = uuid();
  await db.insert(recommendationDecisions).values({
    id: decisionId,
    recommendationId: data.recommendationId,
    portfolioId: manual?.id ?? null,
    decision: data.decision,
    note: data.note ?? null,
  });

  let fill = null as ReturnType<typeof simulatePaperFill> | null;

  if (data.decision === "accept" && manual && rec.action === "buy") {
    const provider = getMarketProvider();
    const decisionAt = new Date().toISOString();
    const fillDate = nextTradingDayForSymbol(
      (() => {
        const d = new Date(decisionAt.slice(0, 10) + "T12:00:00Z");
        d.setUTCDate(d.getUTCDate() + 1);
        return d;
      })(),
      rec.symbol,
    );
    const from = new Date(fillDate);
    from.setUTCDate(from.getUTCDate() - 5);
    const bars = await provider.getHistory(
      rec.symbol,
      from.toISOString().slice(0, 10),
      fillDate,
    );
    const opensByDate: Record<string, number> = {};
    for (const b of bars) opensByDate[b.date] = b.open;

    // If demo has no bar on fillDate, synthesize open from last close
    if (!opensByDate[fillDate] && bars.length) {
      opensByDate[fillDate] = bars[bars.length - 1]!.close;
    }

    const meta = findInstrument(rec.symbol);
    try {
      fill = simulatePaperFill({
        symbol: rec.symbol,
        side: "buy",
        notional: data.notional ?? 50,
        decisionAt,
        opensByDate,
        quoteCurrency: meta?.currency ?? "USD",
        sameDaySessionClosed: true,
      });
      await db.insert(transactions).values({
        id: uuid(),
        portfolioId: manual.id,
        symbol: fill.symbol,
        side: fill.side,
        quantity: fill.quantity,
        price: fill.fillPrice,
        fees: fill.fees,
        slippage: fill.slippage,
        fxCost: fill.fxCost,
        executedAt: fill.executedAt,
        fillSource: fill.fillSource,
        recommendationId: rec.id,
        note: "Manual accept",
      });
    } catch (err) {
      return NextResponse.json({
        decisionId,
        fillError: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Model portfolio auto-executes separately (documented); not triggered by manual accept.
  return NextResponse.json({ decisionId, fill, ok: true });
});
