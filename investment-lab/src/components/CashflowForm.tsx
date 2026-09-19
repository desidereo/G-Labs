"use client";

import { useState } from "react";
import { apiFetch } from "@/components/api";

export function CashflowForm({
  portfolioId,
  onSuccess,
}: {
  portfolioId?: string;
  onSuccess?: () => void;
}) {
  const [type, setType] = useState<"deposit" | "withdrawal">("deposit");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setOk(null);
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setError("Enter a positive amount.");
      return;
    }
    setBusy(true);
    try {
      await apiFetch("/api/portfolio/cashflow", {
        method: "POST",
        body: JSON.stringify({
          portfolioId,
          type,
          amount: value,
          note: note.trim() || undefined,
          occurredAt: new Date().toISOString(),
        }),
      });
      setOk(`${type === "deposit" ? "Deposit" : "Withdrawal"} recorded.`);
      setAmount("");
      setNote("");
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record cash flow.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="panel panel-pad flex flex-col gap-4">
      <h2 className="m-0 text-base font-bold text-[var(--dark)]">Record cash flow</h2>
      <p className="m-0 text-sm text-[var(--text-muted)]">
        Deposits and withdrawals are mirrored into the benchmark for fair TWR comparison.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="field">
          <label htmlFor="cf-type">Type</label>
          <select
            id="cf-type"
            value={type}
            onChange={(e) => setType(e.target.value as "deposit" | "withdrawal")}
          >
            <option value="deposit">Deposit</option>
            <option value="withdrawal">Withdrawal</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="cf-amount">Amount</label>
          <input
            id="cf-amount"
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="cf-note">Note (optional)</label>
          <input
            id="cf-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. weekly top-up"
          />
        </div>
      </div>
      {error ? <p className="m-0 text-sm text-[var(--danger)]">{error}</p> : null}
      {ok ? <p className="m-0 text-sm text-[var(--success)]">{ok}</p> : null}
      <div>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? "Saving…" : "Save cash flow"}
        </button>
      </div>
    </form>
  );
}
