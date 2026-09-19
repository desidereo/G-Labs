/** UI-facing types for Investment Lab dashboard. Align with backend API payloads. */

export type ResearchAction =
  | "hold"
  | "watch"
  | "buy"
  | "insufficient_evidence"
  | "no_change";

export type JobStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

export type RunMode = "demo" | "live";

export interface ComponentScores {
  momentum?: number;
  quality?: number;
  valuation?: number;
  volatility?: number;
  liquidity?: number;
  relativeStrength?: number;
  [key: string]: number | undefined;
}

export interface EvidenceItem {
  claim: string;
  source?: string;
  url?: string;
  asOf?: string;
  confidence?: "low" | "medium" | "high";
}

export interface DataQuality {
  coverage?: number;
  freshness?: "fresh" | "stale" | "unknown";
  missingFields?: string[];
  notes?: string[];
}

export interface Recommendation {
  id: string;
  symbol: string;
  name?: string;
  rank: number;
  overallScore: number;
  componentScores: ComponentScores;
  action: ResearchAction;
  rationale?: string;
  horizon?: string;
  risks?: string[];
  invalidation?: string;
  evidence?: EvidenceItem[];
  dataQuality?: DataQuality;
  price?: number;
  priceAsOf?: string;
  currency?: string;
  assetClass?: "stock" | "etf";
}

export interface ResearchSnapshot {
  id: string;
  runId?: string;
  createdAt: string;
  strategyVersion?: string;
  mode?: RunMode;
  published?: boolean;
  recommendations: Recommendation[];
  stale?: boolean;
  staleReason?: string;
}

export interface ResearchStatus {
  demoMode: boolean;
  latestRun?: {
    id: string;
    status: JobStatus;
    mode: RunMode;
    startedAt?: string;
    finishedAt?: string;
    progress?: number;
    currentStep?: string;
    error?: string;
  };
  lastSuccess?: {
    id: string;
    finishedAt?: string;
    snapshotId?: string;
  };
  nextScheduledAt?: string;
  scheduleLabel?: string;
  dataStale?: boolean;
  staleReason?: string;
}

export interface HoldingRow {
  symbol: string;
  name?: string;
  quantity: number;
  avgCost?: number;
  marketValue?: number;
  weight?: number;
  currency?: string;
  pnl?: number;
  pnlPct?: number;
}

export interface CashFlowRow {
  id?: string;
  amount: number;
  type: "deposit" | "withdrawal";
  occurredAt: string;
  note?: string;
}

export interface PortfolioSummary {
  id: string;
  kind: "paper_manual" | "paper_model" | "benchmark";
  name: string;
  currency: string;
  cash: number;
  invested: number;
  totalValue: number;
  startingBalance?: number;
  holdings: HoldingRow[];
  recentCashFlows?: CashFlowRow[];
  pendingRecommendation?: Recommendation | null;
}

export interface PortfolioResponse {
  portfolios: PortfolioSummary[];
  demoMode?: boolean;
  asOf?: string;
}

export interface PerformancePoint {
  date: string;
  value: number;
  label?: string;
}

export interface PerformanceSeries {
  name: string;
  kind: "paper_manual" | "paper_model" | "benchmark" | "backtest";
  points: PerformancePoint[];
}

export interface PerformanceMetrics {
  twr?: number;
  mwr?: number;
  maxDrawdown?: number;
  volatility?: number;
  excessVsBenchmark?: number;
  currency?: string;
}

export interface PerformanceResponse {
  series: PerformanceSeries[];
  metrics?: Record<string, PerformanceMetrics>;
  asOf?: string;
  note?: string;
}

export interface JobRun {
  id: string;
  status: JobStatus;
  mode: RunMode;
  startedAt?: string;
  finishedAt?: string;
  progress?: number;
  currentStep?: string;
  idempotencyKey?: string;
  error?: string;
  attempt?: number;
}

export interface JobsResponse {
  jobs: JobRun[];
}

export interface LabSettings {
  scheduleTime?: string;
  timezone?: string;
  weekdaysOnly?: boolean;
  demoMode?: boolean;
  startingBalance?: number;
  baseCurrency?: string;
  fractionalShares?: boolean;
  maxPositionWeight?: number;
  maxSectorWeight?: number;
  notifyOnFailure?: boolean;
  [key: string]: unknown;
}

export interface ApiErrorBody {
  error?: string;
  message?: string;
}
