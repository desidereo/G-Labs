import type { HoldingRow } from "@/lib/ui-types";
import { formatMoney, formatPct } from "@/components/format";

export function PortfolioTable({
  holdings,
  currency = "GBP",
}: {
  holdings: HoldingRow[];
  currency?: string;
}) {
  if (!holdings.length) return null;

  return (
    <div className="panel overflow-x-auto">
      <table className="data-table">
        <thead>
          <tr>
            <th>Symbol</th>
            <th>Qty</th>
            <th>Avg cost</th>
            <th>Value</th>
            <th>Weight</th>
            <th>P&amp;L</th>
          </tr>
        </thead>
        <tbody>
          {holdings.map((h) => (
            <tr key={h.symbol}>
              <td>
                <span className="font-bold text-[var(--dark)]">{h.symbol}</span>
                {h.name ? (
                  <div className="text-xs text-[var(--text-muted)]">{h.name}</div>
                ) : null}
              </td>
              <td className="tabular-nums">{h.quantity.toFixed(4)}</td>
              <td className="tabular-nums">
                {formatMoney(h.avgCost, h.currency || currency)}
              </td>
              <td className="tabular-nums font-semibold">
                {formatMoney(h.marketValue, currency)}
              </td>
              <td className="tabular-nums">
                {h.weight != null ? formatPct(h.weight, 1) : "—"}
              </td>
              <td
                className={`tabular-nums ${
                  (h.pnl ?? 0) >= 0 ? "text-[var(--success)]" : "text-[var(--danger)]"
                }`}
              >
                {formatMoney(h.pnl, currency)}
                {h.pnlPct != null ? (
                  <span className="ml-1 text-xs">({formatPct(h.pnlPct)})</span>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
