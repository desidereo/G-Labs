"use client";

import Link from "next/link";
import { ApiGate } from "@/components/useApiData";
import { MetricCard } from "@/components/MetricCard";
import { CandidateTable } from "@/components/CandidateTable";
import { EmptyState } from "@/components/EmptyState";
import { RunResearchButton } from "@/components/RunResearchButton";
import { formatDateTime, formatMoney } from "@/components/format";
import type {
  PortfolioResponse,
  ResearchSnapshot,
  ResearchStatus,
} from "@/lib/ui-types";

export default function OverviewPage() {
  return (
    <div className="lab-page">
      <header>
        <h1>Overview</h1>
        <p className="page-lead">
          Snapshot of today&apos;s research, paper portfolio value, and job health.
        </p>
      </header>

      <ApiGate<ResearchStatus> path="/api/research/status" loadingLabel="Loading status…">
        {({ data: status, reload: reloadStatus }) => (
          <>
            <div className="metric-grid">
              <MetricCard
                label="Latest run"
                value={status.latestRun?.status || "None"}
                hint={
                  status.latestRun?.finishedAt
                    ? formatDateTime(status.latestRun.finishedAt)
                    : status.latestRun?.currentStep
                }
              />
              <MetricCard
                label="Last success"
                value={
                  status.lastSuccess?.finishedAt
                    ? formatDateTime(status.lastSuccess.finishedAt)
                    : "—"
                }
                hint={status.scheduleLabel || status.nextScheduledAt}
              />
              <MetricCard
                label="Mode"
                value={status.demoMode ? "Demo" : "Live"}
                tone={status.demoMode ? "warning" : "default"}
              />
              <MetricCard
                label="Data freshness"
                value={status.dataStale ? "Stale" : "OK"}
                tone={status.dataStale ? "warning" : "positive"}
                hint={status.staleReason}
              />
            </div>

            <div className="panel panel-pad flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="m-0 text-base font-bold text-[var(--dark)]">
                  Manual research
                </h2>
                <p className="mt-1 mb-0 text-sm text-[var(--text-muted)]">
                  Idempotent weekday pipeline — safe to retry.
                </p>
              </div>
              <RunResearchButton onStarted={() => void reloadStatus()} />
            </div>
          </>
        )}
      </ApiGate>

      <ApiGate<PortfolioResponse> path="/api/portfolio" loadingLabel="Loading portfolio…">
        {({ data }) => {
          const primary =
            data.portfolios?.find((p) => p.kind === "paper_manual") ||
            data.portfolios?.[0];
          if (!primary) {
            return (
              <EmptyState
                title="No paper portfolio"
                description="Backend seed should create paper portfolios. Check settings and seed."
              />
            );
          }
          return (
            <div className="metric-grid">
              <MetricCard
                label={primary.name}
                value={formatMoney(primary.totalValue, primary.currency)}
                hint={`Cash ${formatMoney(primary.cash, primary.currency)} · Invested ${formatMoney(primary.invested, primary.currency)}`}
              />
              <MetricCard
                label="Holdings"
                value={primary.holdings?.length ?? 0}
                hint={
                  <Link href="/portfolio" className="text-[var(--primary)] hover:underline">
                    View portfolio →
                  </Link>
                }
              />
            </div>
          );
        }}
      </ApiGate>

      <section className="flex flex-col gap-3">
        <div className="flex items-end justify-between gap-3">
          <h2 className="m-0 text-lg font-bold text-[var(--dark)]">Top candidates</h2>
          <Link
            href="/research"
            className="text-sm font-semibold text-[var(--primary)] hover:underline"
          >
            Full research →
          </Link>
        </div>
        <ApiGate<ResearchSnapshot>
          path="/api/research/latest"
          loadingLabel="Loading research…"
        >
          {({ data }) => {
            const top = [...(data.recommendations || [])]
              .sort((a, b) => a.rank - b.rank)
              .slice(0, 5);
            if (!top.length) {
              return (
                <EmptyState
                  title="No published research yet"
                  description="Run the research pipeline to publish a ranked candidate list."
                  action={
                    <Link href="/automation" className="btn btn-primary">
                      Go to Automation
                    </Link>
                  }
                />
              );
            }
            return <CandidateTable recommendations={top} />;
          }}
        </ApiGate>
      </section>
    </div>
  );
}
