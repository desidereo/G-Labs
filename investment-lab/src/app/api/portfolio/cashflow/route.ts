import { NextResponse } from "next/server";
import { z } from "zod";
import { v4 as uuid } from "uuid";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db/client";
import { ensureTables } from "@/lib/db/migrate";
import { cashFlows, portfolios } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const bodySchema = z.object({
  portfolioId: z.string().min(1),
  amount: z.number().positive(),
  type: z.enum(["deposit", "withdrawal"]),
  occurredAt: z.string().optional(),
  note: z.string().optional(),
  /** Also mirror into benchmark portfolio when true (default true for deposits) */
  mirrorBenchmark: z.boolean().optional(),
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
  const portfolio = await db.query.portfolios.findFirst({
    where: eq(portfolios.id, data.portfolioId),
  });
  if (!portfolio) {
    return NextResponse.json({ error: "Portfolio not found" }, { status: 404 });
  }

  const occurredAt = data.occurredAt ?? new Date().toISOString();
  const id = uuid();
  await db.insert(cashFlows).values({
    id,
    portfolioId: data.portfolioId,
    amount: data.amount,
    type: data.type,
    occurredAt,
    note: data.note ?? null,
  });

  const mirror = data.mirrorBenchmark ?? true;
  if (mirror && portfolio.kind !== "benchmark") {
    const bench = await db.query.portfolios.findFirst({
      where: eq(portfolios.kind, "benchmark"),
    });
    if (bench) {
      await db.insert(cashFlows).values({
        id: uuid(),
        portfolioId: bench.id,
        amount: data.amount,
        type: data.type,
        occurredAt,
        note: `Mirrored from ${portfolio.name}`,
      });
    }
  }

  return NextResponse.json({ id, ok: true });
});
