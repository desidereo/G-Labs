"use client";

import { ApiGate } from "@/components/useApiData";
import { PerformanceCharts } from "@/components/PerformanceCharts";
import type { PerformanceResponse } from "@/lib/ui-types";

export default function PerformancePage() {
  return (
    <div className="lab-page">
      <header>
        <h1>Performance</h1>
        <p className="page-lead">
          Time-weighted and money-weighted returns versus the cash-flow-matched
          benchmark. Backtest curves are never joined with live paper.
        </p>
      </header>

      <ApiGate<PerformanceResponse>
        path="/api/performance"
        loadingLabel="Loading performance…"
      >
        {({ data }) => <PerformanceCharts data={data} />}
      </ApiGate>
    </div>
  );
}
