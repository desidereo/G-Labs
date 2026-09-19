import { z } from "zod";

/** Untrusted AI synthesis — always schema-validate before use. */
export const evidenceClaimSchema = z.object({
  claim: z.string().min(1).max(2000),
  url: z.string().url().optional().or(z.literal("")),
  asOf: z.string().optional(),
  source: z.string().optional(),
});

export const aiSynthesisSchema = z.object({
  symbol: z.string().min(1),
  rationale: z.string().min(1).max(8000),
  risks: z.array(z.string().max(1000)).max(20),
  invalidation: z.string().max(2000),
  evidence: z.array(evidenceClaimSchema).max(30),
  catalysts: z.array(z.string().max(1000)).max(20).default([]),
  horizon: z.string().max(200).optional(),
  synthetic: z.boolean().optional(),
});

export type AiSynthesis = z.infer<typeof aiSynthesisSchema>;
export type EvidenceClaim = z.infer<typeof evidenceClaimSchema>;

export interface AiUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedUsd: number;
}

export interface AiSynthesisRequest {
  symbol: string;
  scores: Record<string, unknown>;
  dataQuality: Record<string, unknown>;
  price?: number | null;
  newsStubs?: Array<{ title: string; url?: string; publishedAt?: string }>;
  runId?: string;
}

export interface AiSynthesisResult {
  synthesis: AiSynthesis;
  usage: AiUsage;
  provider: string;
}

export interface AiProvider {
  name: string;
  synthesise(req: AiSynthesisRequest): Promise<AiSynthesisResult>;
}

export function parseAiSynthesis(raw: unknown): AiSynthesis {
  return aiSynthesisSchema.parse(raw);
}

export function safeParseAiSynthesis(raw: unknown) {
  return aiSynthesisSchema.safeParse(raw);
}
