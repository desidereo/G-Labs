/**
 * Paper execution: fill at next eligible session open — never prior close after hours.
 */

import {
  exchangeForSymbol,
  isTradingDay,
  nextTradingDayForSymbol,
} from "@/lib/providers/calendar/exchange";
import { config } from "@/lib/config";

export interface ExecutionCosts {
  feeBps: number; // commission-like
  spreadBps: number;
  slippageBps: number;
  fxBps: number; // FX conversion friction when quote != base
}

export const DEFAULT_COSTS: ExecutionCosts = {
  feeBps: 5,
  spreadBps: 5,
  slippageBps: 5,
  fxBps: 10,
};

export interface FillRequest {
  symbol: string;
  side: "buy" | "sell";
  /** Notional in portfolio currency, or quantity if quantity set */
  notional?: number;
  quantity?: number;
  /** Recommendation / decision timestamp (ISO) */
  decisionAt: string;
  /** Session open prices by date YYYY-MM-DD */
  opensByDate: Record<string, number>;
  quoteCurrency: string;
  baseCurrency?: string;
  allowFractional?: boolean;
  costs?: Partial<ExecutionCosts>;
  /** If decision is after session close, skip same-day open */
  sameDaySessionClosed?: boolean;
}

export interface FillResult {
  symbol: string;
  side: "buy" | "sell";
  quantity: number;
  fillPrice: number;
  grossNotional: number;
  fees: number;
  slippage: number;
  fxCost: number;
  netCashDelta: number; // negative for buys
  executedAt: string; // date of fill session
  fillSource: "next_session_open";
}

function bps(notional: number, b: number): number {
  return (Math.abs(notional) * b) / 10_000;
}

/**
 * Determine the first eligible fill date: next trading session on/after decision.
 * NEVER uses prior close for after-hours recommendations.
 */
export function resolveFillDate(opts: {
  symbol: string;
  decisionAt: string;
  sameDaySessionClosed?: boolean;
}): string {
  const decision = new Date(opts.decisionAt);
  const day = decision.toISOString().slice(0, 10);
  const exchange = exchangeForSymbol(opts.symbol);

  // After-hours / evening research: do not fill on the decision calendar day
  const forceNext =
    opts.sameDaySessionClosed !== false
      ? true // default true for evening research
      : false;

  if (forceNext) {
    const next = new Date(day + "T12:00:00Z");
    next.setUTCDate(next.getUTCDate() + 1);
    return nextTradingDayForSymbol(next, opts.symbol);
  }

  if (isTradingDay(day, exchange)) {
    return day;
  }
  return nextTradingDayForSymbol(day, opts.symbol);
}

export function simulatePaperFill(req: FillRequest): FillResult {
  const costs: ExecutionCosts = { ...DEFAULT_COSTS, ...req.costs };
  const allowFractional =
    req.allowFractional ?? config.allowFractionalShares;
  const base = req.baseCurrency ?? config.baseCurrency;

  const fillDate = resolveFillDate({
    symbol: req.symbol,
    decisionAt: req.decisionAt,
    sameDaySessionClosed: req.sameDaySessionClosed,
  });

  const open = req.opensByDate[fillDate];
  if (open == null || open <= 0) {
    throw new Error(
      `No open price for ${req.symbol} on fill date ${fillDate} (next-session fill only)`,
    );
  }

  // Adverse slippage vs open
  const slipMult =
    req.side === "buy"
      ? 1 + costs.slippageBps / 10_000 + costs.spreadBps / 20_000
      : 1 - costs.slippageBps / 10_000 - costs.spreadBps / 20_000;
  const fillPrice = open * slipMult;

  let quantity: number;
  if (req.quantity != null) {
    quantity = req.quantity;
  } else if (req.notional != null) {
    quantity = req.notional / fillPrice;
  } else {
    throw new Error("Fill requires notional or quantity");
  }

  if (!allowFractional) {
    quantity = Math.floor(quantity);
  }
  if (quantity <= 0) {
    throw new Error("Quantity rounds to zero");
  }

  const grossNotional = quantity * fillPrice;
  const fees = bps(grossNotional, costs.feeBps);
  const slippage = Math.abs(quantity * (fillPrice - open));
  const fxCost =
    req.quoteCurrency !== base ? bps(grossNotional, costs.fxBps) : 0;

  const totalCost = fees + fxCost;
  const netCashDelta =
    req.side === "buy"
      ? -(grossNotional + totalCost)
      : grossNotional - totalCost;

  return {
    symbol: req.symbol,
    side: req.side,
    quantity,
    fillPrice,
    grossNotional,
    fees,
    slippage,
    fxCost,
    netCashDelta,
    executedAt: fillDate,
    fillSource: "next_session_open",
  };
}

/** Guard: reject fills that use same-day prior close after hours. */
export function assertNotPriorCloseFill(opts: {
  decisionAt: string;
  executedAt: string;
  fillPrice: number;
  priorClose?: number;
  sameDaySessionClosed?: boolean;
}): void {
  const decisionDay = opts.decisionAt.slice(0, 10);
  if (
    opts.sameDaySessionClosed !== false &&
    opts.executedAt === decisionDay
  ) {
    throw new Error(
      "Illegal fill: after-hours recommendation must not fill same-day session",
    );
  }
  if (
    opts.priorClose != null &&
    opts.executedAt === decisionDay &&
    Math.abs(opts.fillPrice - opts.priorClose) < 1e-9
  ) {
    throw new Error("Illegal fill: matches prior close on decision day");
  }
}
