import { sql } from "drizzle-orm";
import {
  sqliteTable,
  text,
  integer,
  real,
  index,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

/** key/value settings store (JSON values) */
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value", { mode: "json" }).notNull(),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const instruments = sqliteTable(
  "instruments",
  {
    symbol: text("symbol").primaryKey(),
    name: text("name").notNull(),
    assetClass: text("asset_class", { enum: ["stock", "etf"] }).notNull(),
    currency: text("currency").notNull(),
    region: text("region").notNull(),
    brokerAvailable: integer("broker_available", { mode: "boolean" })
      .notNull()
      .default(true),
    sector: text("sector"),
    benchmarkAlias: text("benchmark_alias"),
    yahooSymbol: text("yahoo_symbol"),
  },
  (t) => [index("instruments_asset_class_idx").on(t.assetClass)],
);

export const researchRuns = sqliteTable(
  "research_runs",
  {
    id: text("id").primaryKey(),
    status: text("status", {
      enum: ["queued", "running", "succeeded", "failed", "cancelled"],
    })
      .notNull()
      .default("queued"),
    mode: text("mode", { enum: ["demo", "live"] }).notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    startedAt: text("started_at"),
    finishedAt: text("finished_at"),
    progress: integer("progress").notNull().default(0),
    currentStep: text("current_step"),
    errorHistory: text("error_history", { mode: "json" })
      .$type<Array<{ at: string; step?: string; message: string }>>()
      .notNull()
      .default(sql`'[]'`),
    attempt: integer("attempt").notNull().default(0),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [
    uniqueIndex("research_runs_idempotency_uidx").on(t.idempotencyKey),
    index("research_runs_status_idx").on(t.status),
  ],
);

export const researchSnapshots = sqliteTable(
  "research_snapshots",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => researchRuns.id),
    published: integer("published", { mode: "boolean" }).notNull().default(false),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    strategyVersion: text("strategy_version").notNull(),
    payload: text("payload", { mode: "json" }).notNull(),
  },
  (t) => [
    index("research_snapshots_published_idx").on(t.published),
    index("research_snapshots_run_idx").on(t.runId),
  ],
);

export const recommendations = sqliteTable(
  "recommendations",
  {
    id: text("id").primaryKey(),
    snapshotId: text("snapshot_id")
      .notNull()
      .references(() => researchSnapshots.id),
    symbol: text("symbol").notNull(),
    rank: integer("rank").notNull(),
    overallScore: real("overall_score").notNull(),
    componentScores: text("component_scores", { mode: "json" }).notNull(),
    action: text("action", {
      enum: ["hold", "watch", "buy", "insufficient_evidence", "no_change"],
    }).notNull(),
    rationale: text("rationale"),
    horizon: text("horizon"),
    risks: text("risks", { mode: "json" }),
    invalidation: text("invalidation"),
    evidence: text("evidence", { mode: "json" }),
    dataQuality: text("data_quality", { mode: "json" }).notNull(),
    price: real("price"),
    priceAsOf: text("price_as_of"),
  },
  (t) => [
    index("recommendations_snapshot_idx").on(t.snapshotId),
    index("recommendations_symbol_idx").on(t.symbol),
  ],
);

export const portfolios = sqliteTable("portfolios", {
  id: text("id").primaryKey(),
  kind: text("kind", {
    enum: ["paper_manual", "paper_model", "benchmark"],
  }).notNull(),
  name: text("name").notNull(),
  currency: text("currency").notNull().default("GBP"),
  startingBalance: real("starting_balance").notNull().default(500),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const cashFlows = sqliteTable(
  "cash_flows",
  {
    id: text("id").primaryKey(),
    portfolioId: text("portfolio_id")
      .notNull()
      .references(() => portfolios.id),
    amount: real("amount").notNull(),
    type: text("type", { enum: ["deposit", "withdrawal"] }).notNull(),
    occurredAt: text("occurred_at").notNull(),
    note: text("note"),
  },
  (t) => [index("cash_flows_portfolio_idx").on(t.portfolioId)],
);

export const holdings = sqliteTable(
  "holdings",
  {
    id: text("id").primaryKey(),
    portfolioId: text("portfolio_id")
      .notNull()
      .references(() => portfolios.id),
    symbol: text("symbol").notNull(),
    quantity: real("quantity").notNull(),
    avgCost: real("avg_cost").notNull(),
    currency: text("currency").notNull(),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [
    uniqueIndex("holdings_portfolio_symbol_uidx").on(t.portfolioId, t.symbol),
  ],
);

export const transactions = sqliteTable(
  "transactions",
  {
    id: text("id").primaryKey(),
    portfolioId: text("portfolio_id")
      .notNull()
      .references(() => portfolios.id),
    symbol: text("symbol").notNull(),
    side: text("side", { enum: ["buy", "sell"] }).notNull(),
    quantity: real("quantity").notNull(),
    price: real("price").notNull(),
    fees: real("fees").notNull().default(0),
    slippage: real("slippage").notNull().default(0),
    fxCost: real("fx_cost").notNull().default(0),
    executedAt: text("executed_at").notNull(),
    fillSource: text("fill_source").notNull().default("next_session_open"),
    recommendationId: text("recommendation_id"),
    note: text("note"),
  },
  (t) => [index("transactions_portfolio_idx").on(t.portfolioId)],
);

export const valuations = sqliteTable(
  "valuations",
  {
    id: text("id").primaryKey(),
    portfolioId: text("portfolio_id")
      .notNull()
      .references(() => portfolios.id),
    asOf: text("as_of").notNull(),
    totalValue: real("total_value").notNull(),
    cash: real("cash").notNull(),
    invested: real("invested").notNull(),
  },
  (t) => [
    index("valuations_portfolio_asof_idx").on(t.portfolioId, t.asOf),
  ],
);

export const jobLocks = sqliteTable("job_locks", {
  name: text("name").primaryKey(),
  lockedUntil: text("locked_until").notNull(),
  owner: text("owner").notNull(),
});

export const costEvents = sqliteTable(
  "cost_events",
  {
    id: text("id").primaryKey(),
    provider: text("provider").notNull(),
    tokens: integer("tokens").notNull().default(0),
    estimatedUsd: real("estimated_usd").notNull().default(0),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    runId: text("run_id"),
  },
  (t) => [index("cost_events_run_idx").on(t.runId)],
);

export const strategyVersions = sqliteTable("strategy_versions", {
  version: text("version").primaryKey(),
  params: text("params", { mode: "json" }).notNull(),
  notes: text("notes"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const recommendationDecisions = sqliteTable(
  "recommendation_decisions",
  {
    id: text("id").primaryKey(),
    recommendationId: text("recommendation_id")
      .notNull()
      .references(() => recommendations.id),
    portfolioId: text("portfolio_id").references(() => portfolios.id),
    decision: text("decision", { enum: ["accept", "reject"] }).notNull(),
    decidedAt: text("decided_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    note: text("note"),
  },
);

export type Instrument = typeof instruments.$inferSelect;
export type ResearchRun = typeof researchRuns.$inferSelect;
export type ResearchSnapshot = typeof researchSnapshots.$inferSelect;
export type Recommendation = typeof recommendations.$inferSelect;
export type Portfolio = typeof portfolios.$inferSelect;
