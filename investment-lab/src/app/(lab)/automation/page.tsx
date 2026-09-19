"use client";

import { ApiGate } from "@/components/useApiData";
import { JobRunList } from "@/components/JobRunList";
import { MetricCard } from "@/components/MetricCard";
import { RunResearchButton } from "@/components/RunResearchButton";
import { formatDateTime } from "@/components/format";
import type { JobsResponse, ResearchStatus } from "@/lib/ui-types";

export default function AutomationPage() {
  return (
    <div className="lab-page">
      <header>
        <h1>Automation</h1>
        <p className="page-lead">
          Weekday schedule (Europe/London), recent runs, and manual trigger. Cron is
          gated by exchange calendar and timezone window.
        </p>
      </header>

      <ApiGate<ResearchStatus> path="/api/research/status" loadingLabel="Loading schedule…">
        {({ data: status, reload }) => (
          <>
            <div className="metric-grid">
              <MetricCard
                label="Schedule"
                value={status.scheduleLabel || "22:30 weekdays"}
                hint={status.nextScheduledAt ? `Next: ${formatDateTime(status.nextScheduledAt)}` : "Timezone Europe/London"}
              />
              <MetricCard
                label="Current run"
                value={status.latestRun?.status || "Idle"}
                hint={status.latestRun?.currentStep}
              />
              <MetricCard
                label="Mode"
                value={status.demoMode ? "Demo" : "Live"}
              />
            </div>

            <div className="panel panel-pad flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="m-0 text-base font-bold text-[var(--dark)]">
                  Run research now
                </h2>
                <p className="mt-1 mb-0 text-sm text-[var(--text-muted)]">
                  Shares the same pipeline as scheduled cron (idempotent key per day).
                </p>
              </div>
              <RunResearchButton onStarted={() => void reload()} />
            </div>
          </>
        )}
      </ApiGate>

      <section className="flex flex-col gap-3">
        <h2 className="m-0 text-lg font-bold text-[var(--dark)]">Recent runs</h2>
        <ApiGate<JobsResponse> path="/api/jobs" loadingLabel="Loading runs…">
          {({ data }) => (
            <JobRunList jobs={(data.jobs || []).slice(0, 15)} />
          )}
        </ApiGate>
      </section>
    </div>
  );
}
