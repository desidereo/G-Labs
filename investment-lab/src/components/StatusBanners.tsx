export function StatusBanners({
  demoMode,
  dataStale,
  staleReason,
}: {
  demoMode?: boolean;
  dataStale?: boolean;
  staleReason?: string;
}) {
  return (
    <div className="sticky top-0 z-50 flex flex-col">
      <div
        role="status"
        className="border-b border-[var(--warning-border)] bg-[var(--warning-bg)] px-4 py-2 text-center text-sm font-semibold text-[var(--warning)]"
      >
        Paper trading only — research never places real orders. Simulated fills and fees.
      </div>
      {demoMode ? (
        <div
          role="status"
          className="border-b border-[var(--demo-border)] bg-[var(--demo-bg)] px-4 py-2 text-center text-sm font-medium text-[var(--demo)]"
        >
          Demo mode — fixture data and synthetic research. Not mixed with live tables.
        </div>
      ) : null}
      {dataStale ? (
        <div
          role="alert"
          className="border-b border-[var(--danger-border)] bg-[var(--danger-bg)] px-4 py-2 text-center text-sm font-medium text-[var(--danger)]"
        >
          Stale market data
          {staleReason ? `: ${staleReason}` : ". Scores may be withheld or marked insufficient evidence."}
        </div>
      ) : null}
    </div>
  );
}
