"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { PerformanceResponse } from "@/lib/ui-types";
import { formatDate, formatMoney, formatPct } from "@/components/format";
import { EmptyState } from "@/components/EmptyState";

const COLORS = ["#2962ff", "#131722", "#047857", "#b45309"];

function mergeSeries(series: PerformanceResponse["series"]) {
  const byDate = new Map<string, Record<string, string | number>>();
  for (const s of series) {
    for (const p of s.points) {
      const row = byDate.get(p.date) || { date: p.date };
      row[s.name] = p.value;
      byDate.set(p.date, row);
    }
  }
  return Array.from(byDate.values()).sort((a, b) =>
    String(a.date).localeCompare(String(b.date)),
  );
}

export function PerformanceCharts({ data }: { data: PerformanceResponse }) {
  if (!data.series?.length || data.series.every((s) => !s.points.length)) {
    return (
      <EmptyState
        title="No performance history yet"
        description="Run research and accept paper trades, or record cash flows, to build equity curves."
      />
    );
  }

  const chartData = mergeSeries(data.series);
  const metricEntries = Object.entries(data.metrics || {});

  return (
    <div className="flex flex-col gap-4">
      {data.note ? (
        <p className="m-0 text-sm text-[var(--text-muted)]">{data.note}</p>
      ) : null}

      <div className="panel panel-pad">
        <h2 className="mb-4 mt-0 text-base font-bold text-[var(--dark)]">
          Equity curves
        </h2>
        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#d5dbe8" />
              <XAxis
                dataKey="date"
                tickFormatter={(v) => formatDate(String(v))}
                tick={{ fontSize: 11, fill: "#5c6578" }}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#5c6578" }}
                tickFormatter={(v) => formatMoney(Number(v), "GBP", 0)}
                width={72}
              />
              <Tooltip
                labelFormatter={(v) => formatDate(String(v))}
                formatter={(value) => formatMoney(Number(value))}
              />
              <Legend />
              {data.series.map((s, i) => (
                <Line
                  key={s.name}
                  type="monotone"
                  dataKey={s.name}
                  stroke={COLORS[i % COLORS.length]}
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {metricEntries.length ? (
        <div className="metric-grid">
          {metricEntries.map(([key, m]) => (
            <div key={key} className="panel panel-pad">
              <div className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                {key}
              </div>
              <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
                <div>
                  <dt className="text-[var(--text-muted)]">TWR</dt>
                  <dd className="m-0 font-semibold">{formatPct(m.twr)}</dd>
                </div>
                <div>
                  <dt className="text-[var(--text-muted)]">MWR</dt>
                  <dd className="m-0 font-semibold">{formatPct(m.mwr)}</dd>
                </div>
                <div>
                  <dt className="text-[var(--text-muted)]">Max DD</dt>
                  <dd className="m-0 font-semibold">{formatPct(m.maxDrawdown)}</dd>
                </div>
                <div>
                  <dt className="text-[var(--text-muted)]">Vol</dt>
                  <dd className="m-0 font-semibold">{formatPct(m.volatility)}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-[var(--text-muted)]">Excess vs benchmark</dt>
                  <dd className="m-0 font-semibold">
                    {formatPct(m.excessVsBenchmark)}
                  </dd>
                </div>
              </dl>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
