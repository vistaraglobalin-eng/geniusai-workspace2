// Credit pricing for AI tasks.
//
// 1 credit = 1,000 input tokens. Output tokens count 5x because they cost the
// provider 5x as much. With Claude Sonnet 5.5 ($2 / $10 per million tokens),
// one credit covers about $0.002 of provider cost, so prices map 1:1 to cost
// and you set your margin in what you charge for credit packs/plans.

export const OUTPUT_TOKEN_WEIGHT = 5;
export const TOKENS_PER_CREDIT = 1000;

/** Credits for a given token usage (always at least 1). */
export function creditsForUsage(inputTokens: number, outputTokens: number): number {
  const weighted = Math.max(0, inputTokens) + OUTPUT_TOKEN_WEIGHT * Math.max(0, outputTokens);
  return Math.max(1, Math.ceil(weighted / TOKENS_PER_CREDIT));
}

/** Most a task can cost: every input token plus the full output allowance. */
export function maxCreditsFor(inputTokens: number, maxOutputTokens: number): number {
  return creditsForUsage(inputTokens, maxOutputTokens);
}

export type ModelPricing = { inputPerMTokUsd: number; outputPerMTokUsd: number };

export const MODEL_PRICING: Record<string, ModelPricing> = {
  "claude-sonnet-5-5": { inputPerMTokUsd: 2, outputPerMTokUsd: 10 },
  "claude-haiku-5-5": { inputPerMTokUsd: 0.1, outputPerMTokUsd: 0.5 },
  "claude-opus-5-5": { inputPerMTokUsd: 4, outputPerMTokUsd: 20 }
};

/** Provider cost in micro-dollars (1 USD = 1,000,000), or null for unknown models. */
export function providerCostMicroUsd(model: string, inputTokens: number, outputTokens: number): number | null {
  const p = MODEL_PRICING[model];
  if (!p) return null;
  // $X per million tokens == X micro-dollars per token.
  return Math.round(inputTokens * p.inputPerMTokUsd + outputTokens * p.outputPerMTokUsd);
}
