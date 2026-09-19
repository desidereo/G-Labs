export function ErrorState({
  title = "Something went wrong",
  message,
  onRetry,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="panel panel-pad border-[var(--danger-border)] bg-[var(--danger-bg)]" role="alert">
      <h2 className="m-0 text-base font-bold text-[var(--danger)]">{title}</h2>
      {message ? (
        <p className="mt-2 mb-0 text-sm text-[var(--danger)]/90">{message}</p>
      ) : null}
      {onRetry ? (
        <button type="button" className="btn btn-secondary mt-4" onClick={onRetry}>
          Try again
        </button>
      ) : null}
    </div>
  );
}
