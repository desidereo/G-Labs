export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="panel panel-pad flex flex-col items-start gap-3 py-10 text-left">
      <h2 className="m-0 text-lg font-bold text-[var(--dark)]">{title}</h2>
      {description ? (
        <p className="m-0 max-w-lg text-sm leading-relaxed text-[var(--text-muted)]">
          {description}
        </p>
      ) : null}
      {action}
    </div>
  );
}
