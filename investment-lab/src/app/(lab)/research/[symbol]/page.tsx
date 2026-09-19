"use client";

import { use } from "react";
import Link from "next/link";
import { ApiGate } from "@/components/useApiData";
import { ScoreBars } from "@/components/ScoreBars";
import { EvidenceList } from "@/components/EvidenceList";
import { EmptyState } from "@/components/EmptyState";
import { actionLabel, formatDateTime, formatMoney } from "@/components/format";
import { apiFetch } from "@/components/api";
import { useState } from "react";
import type { Recommendation } from "@/lib/ui-types";

type DetailPayload = Recommendation & {
  recommendation?: Recommendation;
};

function normalize(data: DetailPayload): Recommendation {
  if (data.recommendation) return { ...data.recommendation, ...data };
  return data;
}

function AcceptReject({ symbol }: { symbol: string }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function act(decision: "accept" | "reject") {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      await apiFetch("/api/portfolio/accept-recommendation", {
        method: "POST",
        body: JSON.stringify({ symbol, decision }),
      });
      setMsg(decision === "accept" ? "Accepted for paper book." : "Rejected.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        className="btn btn-primary"
        disabled={busy}
        onClick={() => void act("accept")}
      >
        Accept (paper)
      </button>
      <button
        type="button"
        className="btn btn-secondary"
        disabled={busy}
        onClick={() => void act("reject")}
      >
        Reject
      </button>
      {msg ? <span className="text-sm text-[var(--success)]">{msg}</span> : null}
      {err ? <span className="text-sm text-[var(--danger)]">{err}</span> : null}
    </div>
  );
}

export default function ResearchSymbolPage({
  params,
}: {
  params: Promise<{ symbol: string }>;
}) {
  const { symbol: raw } = use(params);
  const symbol = decodeURIComponent(raw);

  return (
    <div className="lab-page">
      <div>
        <Link
          href="/research"
          className="text-sm font-semibold text-[var(--primary)] hover:underline"
        >
          ← Daily Research
        </Link>
        <h1 className="mt-2">{symbol}</h1>
        <p className="page-lead">Candidate detail from the latest research snapshot.</p>
      </div>

      <ApiGate<DetailPayload>
        path={`/api/research/${encodeURIComponent(symbol)}`}
        loadingLabel={`Loading ${symbol}…`}
      >
        {({ data }) => {
          const r = normalize(data);
          if (!r.symbol && !r.overallScore && r.rank == null) {
            return (
              <EmptyState
                title="Not found"
                description={`No recommendation for ${symbol} in the latest snapshot.`}
              />
            );
          }
          return (
            <div className="flex flex-col gap-4">
              <div className="panel panel-pad flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-3xl font-bold tabular-nums text-[var(--dark)]">
                      {r.overallScore?.toFixed?.(0) ?? "—"}
                    </span>
                    <span className={`badge badge-${r.action || "hold"}`}>
                      {actionLabel(r.action || "hold")}
                    </span>
                    <span className="text-sm text-[var(--text-muted)]">
                      Rank #{r.rank ?? "—"}
                    </span>
                  </div>
                  <p className="mt-2 mb-0 text-sm text-[var(--text-muted)]">
                    {formatMoney(r.price, r.currency || "USD")} · as of{" "}
                    {formatDateTime(r.priceAsOf)}
                  </p>
                </div>
                <AcceptReject symbol={r.symbol || symbol} />
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="panel panel-pad">
                  <h2 className="mt-0 mb-3 text-base font-bold">Component scores</h2>
                  <ScoreBars scores={r.componentScores || {}} />
                </div>
                <div className="panel panel-pad">
                  <h2 className="mt-0 mb-3 text-base font-bold">Thesis</h2>
                  <p className="m-0 text-sm leading-relaxed text-[var(--text)]">
                    {r.rationale || "No rationale provided."}
                  </p>
                  {r.horizon ? (
                    <p className="mt-3 mb-0 text-xs text-[var(--text-muted)]">
                      Horizon: {r.horizon}
                    </p>
                  ) : null}
                  {r.invalidation ? (
                    <p className="mt-2 mb-0 text-xs text-[var(--warning)]">
                      Invalidation: {r.invalidation}
                    </p>
                  ) : null}
                </div>
              </div>

              {r.risks?.length ? (
                <div className="panel panel-pad">
                  <h2 className="mt-0 mb-3 text-base font-bold">Risks</h2>
                  <ul className="m-0 pl-5 text-sm leading-relaxed">
                    {r.risks.map((risk) => (
                      <li key={risk}>{risk}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="panel panel-pad">
                <h2 className="mt-0 mb-3 text-base font-bold">Evidence</h2>
                <EvidenceList items={r.evidence || []} />
              </div>

              {r.dataQuality ? (
                <div className="panel panel-pad text-sm text-[var(--text-muted)]">
                  <h2 className="mt-0 mb-2 text-base font-bold text-[var(--dark)]">
                    Data quality
                  </h2>
                  <p className="m-0 capitalize">
                    Freshness: {r.dataQuality.freshness || "unknown"}
                    {r.dataQuality.coverage != null
                      ? ` · Coverage ${Math.round(r.dataQuality.coverage * 100)}%`
                      : ""}
                  </p>
                  {r.dataQuality.missingFields?.length ? (
                    <p className="mt-2 mb-0">
                      Missing: {r.dataQuality.missingFields.join(", ")}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        }}
      </ApiGate>
    </div>
  );
}
