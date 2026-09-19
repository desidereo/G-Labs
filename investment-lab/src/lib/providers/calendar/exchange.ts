/**
 * Simple exchange calendar: NYSE weekdays for US names; LSE for .L.
 * Major US holiday set 2025–2027 (not exhaustive for LSE).
 */

const US_HOLIDAYS = new Set([
  // 2025
  "2025-01-01",
  "2025-01-20",
  "2025-02-17",
  "2025-04-18",
  "2025-05-26",
  "2025-06-19",
  "2025-07-04",
  "2025-09-01",
  "2025-11-27",
  "2025-12-25",
  // 2026
  "2026-01-01",
  "2026-01-19",
  "2026-02-16",
  "2026-04-03",
  "2026-05-25",
  "2026-06-19",
  "2026-07-03",
  "2026-09-07",
  "2026-11-26",
  "2026-12-25",
  // 2027
  "2027-01-01",
  "2027-01-18",
  "2027-02-15",
  "2027-03-26",
  "2027-05-31",
  "2027-06-18",
  "2027-07-05",
  "2027-09-06",
  "2027-11-25",
  "2027-12-24",
]);

/** Common UK/LSE holidays overlapping with US plus Boxing Day / Early May etc. */
const LSE_HOLIDAYS = new Set([
  ...US_HOLIDAYS,
  "2025-04-21",
  "2025-05-05",
  "2025-05-26",
  "2025-08-25",
  "2025-12-26",
  "2026-04-06",
  "2026-05-04",
  "2026-05-25",
  "2026-08-31",
  "2026-12-28",
  "2027-03-29",
  "2027-05-03",
  "2027-05-31",
  "2027-08-30",
  "2027-12-27",
  "2027-12-28",
]);

export type Exchange = "NYSE" | "LSE";

export function exchangeForSymbol(symbol: string): Exchange {
  return symbol.endsWith(".L") ? "LSE" : "NYSE";
}

function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function isWeekend(date: Date | string): boolean {
  const d = typeof date === "string" ? new Date(date + "T12:00:00Z") : date;
  const day = d.getUTCDay();
  return day === 0 || day === 6;
}

export function isHoliday(date: Date | string, exchange: Exchange): boolean {
  const key =
    typeof date === "string" ? date.slice(0, 10) : toDateString(date);
  if (exchange === "LSE") return LSE_HOLIDAYS.has(key);
  return US_HOLIDAYS.has(key);
}

export function isTradingDay(
  date: Date | string,
  exchange: Exchange = "NYSE",
): boolean {
  if (isWeekend(date)) return false;
  if (isHoliday(date, exchange)) return false;
  return true;
}

export function isTradingDayForSymbol(
  date: Date | string,
  symbol: string,
): boolean {
  return isTradingDay(date, exchangeForSymbol(symbol));
}

/** Next session on or after `from` (inclusive if trading day). */
export function nextTradingDay(
  from: Date | string,
  exchange: Exchange = "NYSE",
  maxLookahead = 14,
): string {
  const d =
    typeof from === "string"
      ? new Date(from.slice(0, 10) + "T12:00:00Z")
      : new Date(from);
  for (let i = 0; i < maxLookahead; i++) {
    if (isTradingDay(d, exchange)) return toDateString(d);
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return toDateString(d);
}

export function nextTradingDayForSymbol(
  from: Date | string,
  symbol: string,
): string {
  return nextTradingDay(from, exchangeForSymbol(symbol));
}

/**
 * Count trading days between two dates (exclusive of start, inclusive of end-ish).
 * Used for freshness: stale if last bar older than `maxAgeTradingDays` when markets should have printed.
 */
export function tradingDaysBetween(
  from: string,
  to: string,
  exchange: Exchange = "NYSE",
): number {
  const start = new Date(from.slice(0, 10) + "T12:00:00Z");
  const end = new Date(to.slice(0, 10) + "T12:00:00Z");
  if (end < start) return 0;
  let count = 0;
  const cur = new Date(start);
  cur.setUTCDate(cur.getUTCDate() + 1);
  while (cur <= end) {
    if (isTradingDay(cur, exchange)) count++;
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return count;
}

export function isPriceStale(opts: {
  lastBarDate: string | null;
  asOf?: Date;
  symbol: string;
  maxAgeTradingDays?: number;
}): { stale: boolean; reason?: string } {
  const maxAge = opts.maxAgeTradingDays ?? 3;
  if (!opts.lastBarDate) {
    return { stale: true, reason: "No price bars" };
  }
  const asOf = opts.asOf ?? new Date();
  const exchange = exchangeForSymbol(opts.symbol);
  const today = toDateString(asOf);
  // If today is not a session, compare against last expected session
  let ref = today;
  if (!isTradingDay(today, exchange)) {
    // walk back to last trading day
    const d = new Date(today + "T12:00:00Z");
    for (let i = 0; i < 10; i++) {
      d.setUTCDate(d.getUTCDate() - 1);
      if (isTradingDay(d, exchange)) {
        ref = toDateString(d);
        break;
      }
    }
  }
  const age = tradingDaysBetween(opts.lastBarDate, ref, exchange);
  if (age > maxAge) {
    return {
      stale: true,
      reason: `Last bar ${opts.lastBarDate} is ${age} trading days before ${ref}`,
    };
  }
  return { stale: false };
}
