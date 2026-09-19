import { v4 as uuid } from "uuid";
import { getDb } from "@/lib/db/client";
import { recommendations, researchSnapshots } from "@/lib/db/schema";
import { getMarketProvider } from "@/lib/providers/market";
import { checkYahooFreshness } from "@/lib/providers/market/yahoo";
import { getAiProvider, recordAiCost } from "@/lib/providers/ai";
import {
  BENCHMARK_FALLBACKS,
  BENCHMARK_SYMBOL,
  UNIVERSE,
  type UniverseInstrument,
} from "@/lib/universe";
import {
  STRATEGY_VERSION,
  relativeRankScores,
  scoreInstrument,
  type ScoreResult,
} from "@/lib/strategy/scoring";
import { publishSnapshot } from "./publish";
import type { MarketBar } from "@/lib/providers/types";

export type ProgressFn = (progress: number, step: string) => Promise<void>;

async function loadBenchmarkBars(
  provider: ReturnType<typeof getMarketProvider>,
  from: string,
  to: string,
): Promise<{ symbol: string; bars: MarketBar[] }> {
  const candidates = [BENCHMARK_SYMBOL, ...BENCHMARK_FALLBACKS];
  for (const symbol of candidates) {
    try {
      const bars = await provider.getHistory(symbol, from, to);
      if (bars.length >= 60) return { symbol, bars };
    } catch {
      // try next
    }
  }
  return { symbol: BENCHMARK_SYMBOL, bars: [] };
}

function newsStubs(symbol: string) {
  return [
    {
      title: `Research stub headline for ${symbol}`,
      source: "stub",
      publishedAt: new Date().toISOString(),
    },
  ];
}

/**
 * Shared pipeline for manual + scheduled research.
 * Failed runs must leave last successful published snapshot intact
 * (we only publish at the end via publishSnapshot).
 */
export async function runResearchPipeline(
  runId: string,
  onProgress: ProgressFn = async () => {},
): Promise<{ snapshotId: string }> {
  const db = getDb();
  const provider = getMarketProvider();
  const ai = getAiProvider();

  const to = new Date().toISOString().slice(0, 10);
  const fromDate = new Date();
  fromDate.setUTCFullYear(fromDate.getUTCFullYear() - 2);
  const from = fromDate.toISOString().slice(0, 10);

  await onProgress(5, "fetch_market_data");

  const bench = await loadBenchmarkBars(provider, from, to);

  const investable = UNIVERSE.filter((u) => u.brokerAvailable);
  const fetched: Array<{
    instrument: UniverseInstrument;
    bars: MarketBar[];
    fundamentals: Awaited<ReturnType<typeof provider.getFundamentals>>;
    quote: Awaited<ReturnType<typeof provider.getQuote>>;
    stale: boolean;
    staleReason?: string;
  }> = [];

  for (const instrument of investable) {
    const yahooSym = instrument.yahooSymbol ?? instrument.symbol;
    let bars: MarketBar[] = [];
    try {
      bars = await provider.getHistory(yahooSym, from, to);
    } catch {
      bars = [];
    }
    const fundamentals = await provider.getFundamentals(yahooSym);
    const quote = await provider.getQuote(yahooSym);
    const freshness = checkYahooFreshness(instrument.symbol, bars);
    fetched.push({
      instrument,
      bars,
      fundamentals,
      quote,
      stale: freshness.stale,
      staleReason: freshness.reason,
    });
  }

  await onProgress(25, "validate_freshness");

  const coverageOk = fetched.filter((f) => f.bars.length >= 60).length;
  if (coverageOk < Math.ceil(investable.length * 0.5)) {
    throw new Error(
      `Insufficient market coverage: ${coverageOk}/${investable.length} with 60+ bars`,
    );
  }

  await onProgress(40, "compute_scores");

  let scored: ScoreResult[] = fetched.map((f) =>
    scoreInstrument({
      symbol: f.instrument.symbol,
      assetClass: f.instrument.assetClass,
      bars: f.bars.map((b) => ({ date: b.date, close: b.close })),
      fundamentals: f.fundamentals ?? undefined,
      benchmarkBars: bench.bars.map((b) => ({
        date: b.date,
        close: b.close,
      })),
      stale: f.stale,
    }),
  );

  scored = relativeRankScores(scored);

  await onProgress(60, "ai_synthesis");

  const enrichments: Array<{
    symbol: string;
    synthesis: Awaited<ReturnType<typeof ai.synthesise>>["synthesis"];
  }> = [];

  for (const s of scored) {
    const row = fetched.find((f) => f.instrument.symbol === s.symbol);
    try {
      const result = await ai.synthesise({
        symbol: s.symbol,
        scores: s.componentScores as unknown as Record<string, unknown>,
        dataQuality: s.dataQuality as unknown as Record<string, unknown>,
        price: row?.quote?.price ?? row?.bars.at(-1)?.close,
        newsStubs: newsStubs(s.symbol),
        runId,
      });
      await recordAiCost(result, runId);
      enrichments.push({ symbol: s.symbol, synthesis: result.synthesis });
    } catch (err) {
      // Schema / provider failure for one symbol — mark insufficient rather than fail whole run
      const message = err instanceof Error ? err.message : String(err);
      enrichments.push({
        symbol: s.symbol,
        synthesis: {
          symbol: s.symbol,
          rationale: `Synthesis unavailable: ${message}`,
          risks: ["AI synthesis failed validation or provider error"],
          invalidation: "N/A",
          evidence: [],
          catalysts: [],
          synthetic: true,
        },
      });
      s.action = "insufficient_evidence";
    }
  }

  await onProgress(80, "save_unpublished_snapshot");

  const snapshotId = uuid();
  const ranked = [...scored].sort(
    (a, b) => b.overallScore - a.overallScore,
  );

  const payload = {
    strategyVersion: STRATEGY_VERSION,
    benchmarkSymbol: bench.symbol,
    generatedAt: new Date().toISOString(),
    symbols: ranked.map((s) => s.symbol),
  };

  await db.insert(researchSnapshots).values({
    id: snapshotId,
    runId,
    published: false,
    strategyVersion: STRATEGY_VERSION,
    payload,
  });

  for (let i = 0; i < ranked.length; i++) {
    const s = ranked[i]!;
    const row = fetched.find((f) => f.instrument.symbol === s.symbol);
    const syn = enrichments.find((e) => e.symbol === s.symbol)?.synthesis;
    await db.insert(recommendations).values({
      id: uuid(),
      snapshotId,
      symbol: s.symbol,
      rank: i + 1,
      overallScore: s.overallScore,
      componentScores: s.componentScores,
      action: s.action,
      rationale: syn?.rationale ?? null,
      horizon: syn?.horizon ?? null,
      risks: syn?.risks ?? [],
      invalidation: syn?.invalidation ?? null,
      evidence: syn?.evidence ?? [],
      dataQuality: s.dataQuality,
      price: row?.quote?.price ?? row?.bars.at(-1)?.close ?? null,
      priceAsOf: row?.quote?.asOf ?? row?.bars.at(-1)?.date ?? null,
    });
  }

  await onProgress(95, "publish");
  await publishSnapshot(snapshotId);

  return { snapshotId };
}
