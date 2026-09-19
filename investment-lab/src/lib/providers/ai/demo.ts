import {
  parseAiSynthesis,
  type AiProvider,
  type AiSynthesisRequest,
  type AiSynthesisResult,
} from "./types";

/**
 * Demo synthesizer — clearly labels synthetic text.
 * Used when DEMO_MODE or no OPENAI_API_KEY.
 */
export class DemoAiProvider implements AiProvider {
  name = "demo";

  async synthesise(req: AiSynthesisRequest): Promise<AiSynthesisResult> {
    const dq = req.dataQuality as { coverage?: number; missingFields?: string[] };
    const coverage = dq?.coverage ?? 0;
    const missing = dq?.missingFields ?? [];

    const raw = {
      symbol: req.symbol,
      rationale: `[SYNTHETIC DEMO] Automated narrative for ${req.symbol}. Numerical scores were computed in code; this text is fixture-only and not market advice. Coverage=${coverage.toFixed(2)}.`,
      risks: [
        "[SYNTHETIC DEMO] Model risk: scores are hypotheses, not edges.",
        "[SYNTHETIC DEMO] Data risk: demo fixtures may not match live markets.",
        ...(missing.length
          ? [`[SYNTHETIC DEMO] Missing inputs: ${missing.join(", ")}`]
          : []),
      ],
      invalidation:
        "[SYNTHETIC DEMO] Invalidate if live data quality collapses or thesis score drops below hold threshold.",
      evidence: [
        {
          claim:
            "[SYNTHETIC DEMO] Placeholder evidence claim — replace with live provider output.",
          source: "demo-fixture",
          asOf: new Date().toISOString().slice(0, 10),
        },
      ],
      catalysts: ["[SYNTHETIC DEMO] No live catalysts in demo mode"],
      horizon: "3-12 months (demo)",
      synthetic: true,
    };

    const synthesis = parseAiSynthesis(raw);

    return {
      synthesis,
      usage: {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        estimatedUsd: 0,
      },
      provider: this.name,
    };
  }
}
