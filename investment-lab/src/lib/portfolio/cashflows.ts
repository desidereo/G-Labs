export interface CashFlowEvent {
  amount: number; // signed: + deposit, - withdrawal
  type: "deposit" | "withdrawal";
  occurredAt: string; // ISO date or datetime
}

export function signedCashFlow(cf: CashFlowEvent): number {
  if (cf.type === "deposit") return Math.abs(cf.amount);
  return -Math.abs(cf.amount);
}

export function netCashInvested(flows: CashFlowEvent[]): number {
  return flows.reduce((s, f) => s + signedCashFlow(f), 0);
}

export function cashBalanceAfterFlows(
  startingBalance: number,
  flows: CashFlowEvent[],
  tradeCashDeltas: number[] = [],
): number {
  const fromFlows = flows.reduce((s, f) => s + signedCashFlow(f), 0);
  const fromTrades = tradeCashDeltas.reduce((a, b) => a + b, 0);
  return startingBalance + fromFlows + fromTrades;
}

/** Sort chronologically */
export function sortCashFlows<T extends { occurredAt: string }>(flows: T[]): T[] {
  return [...flows].sort((a, b) =>
    a.occurredAt.localeCompare(b.occurredAt),
  );
}
