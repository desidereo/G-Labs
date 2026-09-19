import { config } from "@/lib/config";
import { v4 as uuid } from "uuid";
import { getDb } from "@/lib/db/client";
import { costEvents } from "@/lib/db/schema";
import type { AiProvider, AiSynthesisResult } from "./types";
import { DemoAiProvider } from "./demo";
import { OpenAiCompatibleProvider } from "./openaiCompatible";

export function getAiProvider(): AiProvider {
  if (config.demoMode || !config.openai.apiKey) {
    return new DemoAiProvider();
  }
  return new OpenAiCompatibleProvider();
}

export async function recordAiCost(
  result: AiSynthesisResult,
  runId?: string,
): Promise<void> {
  if (result.usage.totalTokens === 0 && result.usage.estimatedUsd === 0) {
    return;
  }
  const db = getDb();
  await db.insert(costEvents).values({
    id: uuid(),
    provider: result.provider,
    tokens: result.usage.totalTokens,
    estimatedUsd: result.usage.estimatedUsd,
    runId: runId ?? null,
  });
}

export { DemoAiProvider, OpenAiCompatibleProvider };
export * from "./types";
