export function MetricCard({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: "default" | "positive" | "negative" | "warning";
}) {
  const toneClass =
    tone === "positive"
      ? "text-[var(--success)]"
      : tone === "negative"
        ? "text-[var(--danger)]"
        : tone === "warning"
          ? "text-[var(--warning)]"
          : "text-[var(--dark)]";

  return (
    <div className="panel panel-pad">
      <div className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
        {label}
      </div>
      <div className={`mt-1 text-2xl font-bold tracking-tight ${toneClass}`}>
        {value}
      </div>
      {hint ? (
        <div className="mt-1 text-xs text-[var(--text-muted)]">{hint}</div>
      ) : null}
    </div>
  );
}
