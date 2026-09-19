/**
 * Programmatic table creation for libsql/sqlite.
 * Safe to call on startup; uses IF NOT EXISTS.
 */
import { getClient } from "./client";

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS instruments (
    symbol TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    asset_class TEXT NOT NULL,
    currency TEXT NOT NULL,
    region TEXT NOT NULL,
    broker_available INTEGER NOT NULL DEFAULT 1,
    sector TEXT,
    benchmark_alias TEXT,
    yahoo_symbol TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS instruments_asset_class_idx ON instruments(asset_class)`,
  `CREATE TABLE IF NOT EXISTS research_runs (
    id TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'queued',
    mode TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    started_at TEXT,
    finished_at TEXT,
    progress INTEGER NOT NULL DEFAULT 0,
    current_step TEXT,
    error_history TEXT NOT NULL DEFAULT '[]',
    attempt INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS research_runs_idempotency_uidx ON research_runs(idempotency_key)`,
  `CREATE INDEX IF NOT EXISTS research_runs_status_idx ON research_runs(status)`,
  `CREATE TABLE IF NOT EXISTS research_snapshots (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES research_runs(id),
    published INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    strategy_version TEXT NOT NULL,
    payload TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS research_snapshots_published_idx ON research_snapshots(published)`,
  `CREATE INDEX IF NOT EXISTS research_snapshots_run_idx ON research_snapshots(run_id)`,
  `CREATE TABLE IF NOT EXISTS recommendations (
    id TEXT PRIMARY KEY,
    snapshot_id TEXT NOT NULL REFERENCES research_snapshots(id),
    symbol TEXT NOT NULL,
    rank INTEGER NOT NULL,
    overall_score REAL NOT NULL,
    component_scores TEXT NOT NULL,
    action TEXT NOT NULL,
    rationale TEXT,
    horizon TEXT,
    risks TEXT,
    invalidation TEXT,
    evidence TEXT,
    data_quality TEXT NOT NULL,
    price REAL,
    price_as_of TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS recommendations_snapshot_idx ON recommendations(snapshot_id)`,
  `CREATE INDEX IF NOT EXISTS recommendations_symbol_idx ON recommendations(symbol)`,
  `CREATE TABLE IF NOT EXISTS portfolios (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    name TEXT NOT NULL,
    currency TEXT NOT NULL DEFAULT 'GBP',
    starting_balance REAL NOT NULL DEFAULT 500,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS cash_flows (
    id TEXT PRIMARY KEY,
    portfolio_id TEXT NOT NULL REFERENCES portfolios(id),
    amount REAL NOT NULL,
    type TEXT NOT NULL,
    occurred_at TEXT NOT NULL,
    note TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS cash_flows_portfolio_idx ON cash_flows(portfolio_id)`,
  `CREATE TABLE IF NOT EXISTS holdings (
    id TEXT PRIMARY KEY,
    portfolio_id TEXT NOT NULL REFERENCES portfolios(id),
    symbol TEXT NOT NULL,
    quantity REAL NOT NULL,
    avg_cost REAL NOT NULL,
    currency TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS holdings_portfolio_symbol_uidx ON holdings(portfolio_id, symbol)`,
  `CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    portfolio_id TEXT NOT NULL REFERENCES portfolios(id),
    symbol TEXT NOT NULL,
    side TEXT NOT NULL,
    quantity REAL NOT NULL,
    price REAL NOT NULL,
    fees REAL NOT NULL DEFAULT 0,
    slippage REAL NOT NULL DEFAULT 0,
    fx_cost REAL NOT NULL DEFAULT 0,
    executed_at TEXT NOT NULL,
    fill_source TEXT NOT NULL DEFAULT 'next_session_open',
    recommendation_id TEXT,
    note TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS transactions_portfolio_idx ON transactions(portfolio_id)`,
  `CREATE TABLE IF NOT EXISTS valuations (
    id TEXT PRIMARY KEY,
    portfolio_id TEXT NOT NULL REFERENCES portfolios(id),
    as_of TEXT NOT NULL,
    total_value REAL NOT NULL,
    cash REAL NOT NULL,
    invested REAL NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS valuations_portfolio_asof_idx ON valuations(portfolio_id, as_of)`,
  `CREATE TABLE IF NOT EXISTS job_locks (
    name TEXT PRIMARY KEY,
    locked_until TEXT NOT NULL,
    owner TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS cost_events (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    tokens INTEGER NOT NULL DEFAULT 0,
    estimated_usd REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    run_id TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS cost_events_run_idx ON cost_events(run_id)`,
  `CREATE TABLE IF NOT EXISTS strategy_versions (
    version TEXT PRIMARY KEY,
    params TEXT NOT NULL,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS recommendation_decisions (
    id TEXT PRIMARY KEY,
    recommendation_id TEXT NOT NULL REFERENCES recommendations(id),
    portfolio_id TEXT REFERENCES portfolios(id),
    decision TEXT NOT NULL,
    decided_at TEXT NOT NULL DEFAULT (datetime('now')),
    note TEXT
  )`,
];

export async function ensureTables(): Promise<void> {
  const client = getClient();
  for (const sql of STATEMENTS) {
    await client.execute(sql);
  }
}

async function main() {
  await ensureTables();
  // eslint-disable-next-line no-console
  console.log("Database tables ensured.");
}

const isDirect =
  typeof process.argv[1] === "string" &&
  process.argv[1].replace(/\\/g, "/").endsWith("migrate.ts");

if (isDirect) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
