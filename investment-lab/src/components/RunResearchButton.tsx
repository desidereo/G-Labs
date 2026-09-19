"use client";

import { useState } from "react";
import { apiFetch } from "@/components/api";

export function RunResearchButton({
  onStarted,
}: {
  onStarted?: (payload: unknown) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await apiFetch<{
        id?: string;
        status?: string;
        message?: string;
      }>("/api/research/run", { method: "POST", body: JSON.stringify({}) });
      setMessage(
        result.message ||
          (result.id
            ? `Run ${result.id} ${result.status || "queued"}.`
            : "Research run started."),
      );
      onStarted?.(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start research.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        className="btn btn-primary"
        disabled={busy}
        onClick={run}
      >
        {busy ? "Starting…" : "Run research"}
      </button>
      {message ? (
        <p className="m-0 text-sm text-[var(--success)]">{message}</p>
      ) : null}
      {error ? <p className="m-0 text-sm text-[var(--danger)]">{error}</p> : null}
    </div>
  );
}
