"use client";

import { ApiGate } from "@/components/useApiData";
import { MetricCard } from "@/components/MetricCard";
import { PortfolioTable } from "@/components/PortfolioTable";
import { CashflowForm } from "@/components/CashflowForm";
import { EmptyState } from "@/components/EmptyState";
import { formatDate, formatMoney } from "@/components/format";
import type { PortfolioResponse } from "@/lib/ui-types";

export default function PortfolioPage() {
  return (
    <div className="lab-page">
      <header>
        <h1>Portfolio</h1>
        <p className="page-lead">
          Paper holdings, cash, and deposits/withdrawals. Model book may auto-execute
          separately from your manual acceptances.
        </p>
      </header>

      <ApiGate<PortfolioResponse> path="/api/portfolio" loadingLabel="Loading portfolio…">
        {({ data, reload }) => {
          const books = data.portfolios || [];
          if (!books.length) {
            return (
              <EmptyState
                title="No portfolios"
                description="Seed should create paper_manual, paper_model, and benchmark books."
              />
            );
          }

          return (
            <div className="flex flex-col gap-6">
              {data.asOf ? (
                <p className="m-0 text-sm text-[var(--text-muted)]">
                  As of {formatDate(data.asOf)}
                </p>
              ) : null}

              {books.map((p) => (
                <section key={p.id} className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h2 className="m-0 text-lg font-bold text-[var(--dark)]">
                      {p.name}
                      <span className="ml-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                        {p.kind.replace(/_/g, " ")}
                      </span>
                    </h2>
                  </div>
                  <div className="metric-grid">
                    <MetricCard
                      label="Total value"
                      value={formatMoney(p.totalValue, p.currency)}
                    />
                    <MetricCard
                      label="Cash"
                      value={formatMoney(p.cash, p.currency)}
                    />
                    <MetricCard
                      label="Invested"
                      value={formatMoney(p.invested, p.currency)}
                    />
                  </div>
                  {p.holdings?.length ? (
                    <PortfolioTable holdings={p.holdings} currency={p.currency} />
                  ) : (
                    <EmptyState
                      title="No holdings"
                      description="Accept a buy recommendation or wait for model execution."
                    />
                  )}
                  {p.recentCashFlows?.length ? (
                    <div className="panel overflow-x-auto">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Date</th>
                            <th>Type</th>
                            <th>Amount</th>
                            <th>Note</th>
                          </tr>
                        </thead>
                        <tbody>
                          {p.recentCashFlows.map((cf, i) => (
                            <tr key={cf.id || `${cf.occurredAt}-${i}`}>
                              <td>{formatDate(cf.occurredAt)}</td>
                              <td className="capitalize">{cf.type}</td>
                              <td className="tabular-nums">
                                {formatMoney(cf.amount, p.currency)}
                              </td>
                              <td className="text-[var(--text-muted)]">
                                {cf.note || "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                </section>
              ))}

              <CashflowForm
                portfolioId={
                  books.find((b) => b.kind === "paper_manual")?.id || books[0]?.id
                }
                onSuccess={() => void reload()}
              />
            </div>
          );
        }}
      </ApiGate>
    </div>
  );
}
