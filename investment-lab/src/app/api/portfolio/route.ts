import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db/client";
import { ensureTables } from "@/lib/db/migrate";
import { seedDemo } from "@/lib/db/seed";
import { cashFlows, holdings, portfolios, valuations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const GET = auth(async () => {
  await ensureTables();
  await seedDemo();
  const db = getDb();
  const all = await db.query.portfolios.findMany();
  const result = [];
  for (const p of all) {
    const flows = await db.query.cashFlows.findMany({
      where: eq(cashFlows.portfolioId, p.id),
    });
    const holds = await db.query.holdings.findMany({
      where: eq(holdings.portfolioId, p.id),
    });
    const vals = await db.query.valuations.findMany({
      where: eq(valuations.portfolioId, p.id),
      orderBy: (t, { desc }) => [desc(t.asOf)],
      limit: 1,
    });
    result.push({
      portfolio: p,
      cashFlows: flows,
      holdings: holds,
      latestValuation: vals[0] ?? null,
    });
  }
  return NextResponse.json({ portfolios: result });
});
