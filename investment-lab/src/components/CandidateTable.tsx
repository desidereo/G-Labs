import Link from "next/link";
import type { Recommendation } from "@/lib/ui-types";
import { actionLabel, formatDateTime, formatMoney } from "@/components/format";

export function CandidateTable({
  recommendations,
}: {
  recommendations: Recommendation[];
}) {
  if (!recommendations.length) return null;

  return (
    <div className="panel overflow-x-auto">
      <table className="data-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Symbol</th>
            <th>Score</th>
            <th>Action</th>
            <th>Price</th>
            <th>As of</th>
            <th>Quality</th>
          </tr>
        </thead>
        <tbody>
          {recommendations.map((r) => (
            <tr key={r.id || r.symbol}>
              <td className="text-[var(--text-muted)]">{r.rank}</td>
              <td>
                <Link href={`/research/${encodeURIComponent(r.symbol)}`} className="symbol-link">
                  {r.symbol}
                </Link>
                {r.name ? (
                  <div className="text-xs text-[var(--text-muted)]">{r.name}</div>
                ) : null}
              </td>
              <td className="font-semibold tabular-nums">{r.overallScore.toFixed(0)}</td>
              <td>
                <span className={`badge badge-${r.action}`}>{actionLabel(r.action)}</span>
              </td>
              <td className="tabular-nums">
                {formatMoney(r.price, r.currency || "USD")}
              </td>
              <td className="text-xs text-[var(--text-muted)]">
                {formatDateTime(r.priceAsOf)}
              </td>
              <td className="text-xs capitalize text-[var(--text-muted)]">
                {r.dataQuality?.freshness || "—"}
                {r.dataQuality?.coverage != null
                  ? ` · ${Math.round(r.dataQuality.coverage * 100)}%`
                  : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
