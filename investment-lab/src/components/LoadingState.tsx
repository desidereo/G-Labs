export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div
      className="panel panel-pad flex items-center gap-3 py-10"
      role="status"
      aria-live="polite"
    >
      <span
        className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--primary)]"
        aria-hidden
      />
      <span className="text-sm font-medium text-[var(--text-muted)]">{label}</span>
    </div>
  );
}
