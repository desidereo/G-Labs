"use client";

import { ApiGate } from "@/components/useApiData";
import { CandidateTable } from "@/components/CandidateTable";
import { EmptyState } from "@/components/EmptyState";
import { formatDateTime } from "@/components/format";
import type { ResearchSnapshot } from "@/lib/ui-types";

export default function ResearchPage() {
  return (
    <div className="lab-page">
      <header>
        <h1>Daily Research</h1>
        <p className="page-lead">
          Ranked candidates from the latest published snapshot. Scores are relative
          within the current universe.
        </p>
      </header>

      <ApiGate<ResearchSnapshot>
        path="/api/research/latest"
        loadingLabel="Loading candidates…"
      >
        {({ data }) => {
          const list = [...(data.recommendations || [])].sort(
            (a, b) => a.rank - b.rank,
          );
          return (
            <>
              <div className="flex flex-wrap gap-3 text-sm text-[var(--text-muted)]">
                <span>
                  Snapshot:{" "}
                  <strong className="text-[var(--dark)]">
                    {formatDateTime(data.createdAt)}
                  </strong>
                </span>
                {data.strategyVersion ? (
                  <span>
                    Strategy{" "}
                    <strong className="text-[var(--dark)]">{data.strategyVersion}</strong>
                  </span>
                ) : null}
                {data.mode ? (
                  <span className="capitalize">
                    Mode <strong className="text-[var(--dark)]">{data.mode}</strong>
                  </span>
                ) : null}
                {data.stale ? (
                  <span className="font-semibold text-[var(--warning)]">
                    Stale{data.staleReason ? `: ${data.staleReason}` : ""}
                  </span>
                ) : null}
              </div>

              {!list.length ? (
                <EmptyState
                  title="No candidates published"
                  description="A successful research run will publish ranked recommendations here."
                />
              ) : (
                <CandidateTable recommendations={list} />
              )}
            </>
          );
        }}
      </ApiGate>
    </div>
  );
}
