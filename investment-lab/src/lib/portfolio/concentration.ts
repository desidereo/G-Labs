import { config } from "@/lib/config";

export interface PositionSnapshot {
  symbol: string;
  sector: string | null;
  marketValue: number;
}

export interface ConcentrationBreach {
  type: "position" | "sector";
  key: string;
  weight: number;
  limit: number;
}

export function portfolioWeights(
  positions: PositionSnapshot[],
  totalValue: number,
): Array<PositionSnapshot & { weight: number }> {
  if (totalValue <= 0) {
    return positions.map((p) => ({ ...p, weight: 0 }));
  }
  return positions.map((p) => ({
    ...p,
    weight: p.marketValue / totalValue,
  }));
}

export function checkConcentration(
  positions: PositionSnapshot[],
  totalValue: number,
  limits?: { maxPosition?: number; maxSector?: number },
): ConcentrationBreach[] {
  const maxPosition = limits?.maxPosition ?? config.budgets.maxPositionWeight;
  const maxSector = limits?.maxSector ?? config.budgets.maxSectorWeight;
  const breaches: ConcentrationBreach[] = [];
  const withW = portfolioWeights(positions, totalValue);

  for (const p of withW) {
    if (p.weight > maxPosition + 1e-9) {
      breaches.push({
        type: "position",
        key: p.symbol,
        weight: p.weight,
        limit: maxPosition,
      });
    }
  }

  const bySector = new Map<string, number>();
  for (const p of withW) {
    const sector = p.sector ?? "Unknown";
    bySector.set(sector, (bySector.get(sector) ?? 0) + p.weight);
  }
  for (const [sector, weight] of bySector) {
    if (weight > maxSector + 1e-9) {
      breaches.push({
        type: "sector",
        key: sector,
        weight,
        limit: maxSector,
      });
    }
  }

  return breaches;
}

/** Proposed buy notional allowed without breaching limits. */
export function maxBuyNotional(opts: {
  symbol: string;
  sector: string | null;
  positions: PositionSnapshot[];
  totalValue: number;
  cash: number;
  limits?: { maxPosition?: number; maxSector?: number };
}): number {
  const maxPosition = opts.limits?.maxPosition ?? config.budgets.maxPositionWeight;
  const maxSector = opts.limits?.maxSector ?? config.budgets.maxSectorWeight;
  const tv = opts.totalValue;
  if (tv <= 0) return Math.min(opts.cash, 0);

  const currentPos =
    opts.positions.find((p) => p.symbol === opts.symbol)?.marketValue ?? 0;
  const roomPosition = maxPosition * tv - currentPos;

  const sector = opts.sector ?? "Unknown";
  const sectorValue = opts.positions
    .filter((p) => (p.sector ?? "Unknown") === sector)
    .reduce((s, p) => s + p.marketValue, 0);
  const roomSector = maxSector * tv - sectorValue;

  return Math.max(0, Math.min(opts.cash, roomPosition, roomSector));
}
