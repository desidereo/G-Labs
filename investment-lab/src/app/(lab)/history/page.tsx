"use client";

import { ApiGate } from "@/components/useApiData";
import { JobRunList } from "@/components/JobRunList";
import type { JobsResponse } from "@/lib/ui-types";

export default function HistoryPage() {
  return (
    <div className="lab-page">
      <header>
        <h1>History</h1>
        <p className="page-lead">
          Past research job runs — status, timing, and errors. Failed runs leave the
          last successful published snapshot intact.
        </p>
      </header>

      <ApiGate<JobsResponse> path="/api/jobs" loadingLabel="Loading job history…">
        {({ data }) => <JobRunList jobs={data.jobs || []} />}
      </ApiGate>
    </div>
  );
}
