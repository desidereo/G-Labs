import type { ComponentScores } from "@/lib/ui-types";

const LABELS: Record<string, string> = {
  momentum: "Momentum",
  quality: "Quality",
  valuation: "Valuation",
  volatility: "Volatility",
  liquidity: "Liquidity",
  relativeStrength: "Rel. strength",
};

export function ScoreBars({ scores }: { scores: ComponentScores }) {
  const entries = Object.entries(scores).filter(
    ([, v]) => typeof v === "number" && !Number.isNaN(v),
  ) as [string, number][];

  if (!entries.length) {
    return (
      <p className="m-0 text-sm text-[var(--text-muted)]">No component scores available.</p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {entries.map(([key, value]) => {
        const clamped = Math.max(0, Math.min(100, value));
        return (
          <div key={key}>
            <div className="mb-1 flex justify-between text-xs font-semibold">
              <span className="text-[var(--text-muted)]">{LABELS[key] || key}</span>
              <span className="tabular-nums text-[var(--dark)]">{clamped.toFixed(0)}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-[var(--surface-muted)]">
              <div
                className="h-full rounded-full bg-[var(--primary)] transition-[width] duration-500"
                style={{ width: `${clamped}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
