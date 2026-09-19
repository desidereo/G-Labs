import { v4 as uuid } from "uuid";
import { config } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import { ensureTables } from "@/lib/db/migrate";
import {
  instruments,
  portfolios,
  cashFlows,
  strategyVersions,
  settings,
} from "@/lib/db/schema";
import { UNIVERSE } from "@/lib/universe";
import { STRATEGY_VERSION } from "@/lib/strategy/scoring";
import { eq } from "drizzle-orm";

export async function seedDemo(): Promise<void> {
  await ensureTables();
  const db = getDb();

  for (const u of UNIVERSE) {
    const existing = await db.query.instruments.findFirst({
      where: eq(instruments.symbol, u.symbol),
    });
    if (existing) continue;
    await db.insert(instruments).values({
      symbol: u.symbol,
      name: u.name,
      assetClass: u.assetClass,
      currency: u.currency,
      region: u.region,
      brokerAvailable: u.brokerAvailable,
      sector: u.sector,
      yahooSymbol: u.yahooSymbol ?? null,
      benchmarkAlias: u.benchmarkAlias ?? null,
    });
  }

  const kinds = [
    { kind: "paper_manual" as const, name: "Paper Manual" },
    { kind: "paper_model" as const, name: "Paper Model" },
    { kind: "benchmark" as const, name: "Benchmark VWRL" },
  ];

  for (const k of kinds) {
    const existing = await db.query.portfolios.findFirst({
      where: eq(portfolios.kind, k.kind),
    });
    if (existing) continue;
    const id = uuid();
    await db.insert(portfolios).values({
      id,
      kind: k.kind,
      name: k.name,
      currency: config.baseCurrency,
      startingBalance: config.startingPaperBalance,
    });
    await db.insert(cashFlows).values({
      id: uuid(),
      portfolioId: id,
      amount: config.startingPaperBalance,
      type: "deposit",
      occurredAt: new Date().toISOString(),
      note: "Initial seed deposit",
    });
  }

  const sv = await db.query.strategyVersions.findFirst({
    where: eq(strategyVersions.version, STRATEGY_VERSION),
  });
  if (!sv) {
    await db.insert(strategyVersions).values({
      version: STRATEGY_VERSION,
      params: {
        stockWeights: {
          momentum: 0.35,
          quality: 0.2,
          valuation: 0.15,
          volatility: 0.15,
          liquidity: 0.15,
        },
        etfWeights: {
          momentum: 0.3,
          volatility: 0.2,
          expense: 0.15,
          liquidity: 0.15,
          relativeStrength: 0.2,
        },
      },
      notes: "Initial deterministic scoring",
    });
  }

  await db
    .insert(settings)
    .values({
      key: "seeded_at",
      value: new Date().toISOString(),
    })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: new Date().toISOString() },
    });
}

const isDirect =
  typeof process.argv[1] === "string" &&
  process.argv[1].replace(/\\/g, "/").endsWith("seed.ts");

if (isDirect) {
  seedDemo()
    .then(() => {
      console.log("Seed complete");
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
