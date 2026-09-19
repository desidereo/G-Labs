import type { JobRun } from "@/lib/ui-types";
import { formatDateTime } from "@/components/format";
import { EmptyState } from "@/components/EmptyState";

export function JobRunList({ jobs }: { jobs: JobRun[] }) {
  if (!jobs.length) {
    return (
      <EmptyState
        title="No research runs yet"
        description="Trigger a manual run from Automation, or wait for the weekday schedule."
      />
    );
  }

  return (
    <div className="panel overflow-x-auto">
      <table className="data-table">
        <thead>
          <tr>
            <th>Status</th>
            <th>Mode</th>
            <th>Started</th>
            <th>Finished</th>
            <th>Step</th>
            <th>Progress</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => (
            <tr key={job.id}>
              <td>
                <span className={`badge badge-${job.status}`}>{job.status}</span>
                {job.error ? (
                  <div className="mt-1 max-w-xs text-xs text-[var(--danger)]">
                    {job.error}
                  </div>
                ) : null}
              </td>
              <td className="capitalize text-[var(--text-muted)]">{job.mode}</td>
              <td className="text-xs">{formatDateTime(job.startedAt)}</td>
              <td className="text-xs">{formatDateTime(job.finishedAt)}</td>
              <td className="text-sm text-[var(--text-muted)]">
                {job.currentStep || "—"}
              </td>
              <td className="tabular-nums">
                {job.progress != null ? `${Math.round(job.progress)}%` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
