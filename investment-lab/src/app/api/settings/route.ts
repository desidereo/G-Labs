import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db/client";
import { ensureTables } from "@/lib/db/migrate";
import { settings } from "@/lib/db/schema";
import { config } from "@/lib/config";

export const GET = auth(async () => {
  await ensureTables();
  const db = getDb();
  const rows = await db.query.settings.findMany();
  const map: Record<string, unknown> = {};
  for (const r of rows) map[r.key] = r.value;
  return NextResponse.json({
    settings: map,
    runtime: {
      demoMode: config.demoMode,
      timezone: config.timezone,
      researchScheduleLocal: config.researchScheduleLocal,
      baseCurrency: config.baseCurrency,
      startingPaperBalance: config.startingPaperBalance,
      budgets: config.budgets,
    },
  });
});

const patchSchema = z.object({
  key: z.string().min(1),
  value: z.unknown(),
});

export const PATCH = auth(async (req) => {
  await ensureTables();
  const json = await req.json();
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { key, value } = parsed.data;
  // Disallow patching secrets via API
  if (["AUTH_PASSWORD", "AUTH_SECRET", "CRON_SECRET", "OPENAI_API_KEY"].includes(key)) {
    return NextResponse.json({ error: "Forbidden key" }, { status: 403 });
  }
  const db = getDb();
  const existing = await db.query.settings.findFirst({
    where: eq(settings.key, key),
  });
  if (existing) {
    await db
      .update(settings)
      .set({ value, updatedAt: new Date().toISOString() })
      .where(eq(settings.key, key));
  } else {
    await db.insert(settings).values({ key, value });
  }
  return NextResponse.json({ ok: true, key, value });
});
