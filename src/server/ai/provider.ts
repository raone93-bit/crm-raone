import type { AnalyzeInput, ProviderAnalysis } from "./schema";

/**
 * Interface do provedor de IA. Trocar de provedor = escrever outra classe e
 * mudar AI_PROVIDER no ambiente. O resto do sistema só conhece esta interface.
 */
export interface LLMProvider {
  readonly name: "ANTHROPIC" | "OPENAI";
  readonly model: string;
  analyzeConversation(input: AnalyzeInput): Promise<ProviderAnalysis>;
}

const LANG = new Set(["PT", "ES", "EN", "OTHER"]);
const INTENT = new Set([
  "PRICE", "AVAILABILITY", "SAMPLE", "QUOTE", "FREIGHT", "EXPORT", "PROJECT", "MEDIA_REQUEST", "GREETING", "OTHER",
]);
const FINISH = new Set(["POLISHED", "HONED", "LEATHER", "BRUSHED", "SANDBLASTED", "SAWN", "OTHER"]);

/** Normaliza o JSON cru do modelo (snake_case) para ProviderAnalysis. */
export function normalizeProviderOutput(
  raw: any,
  usage: { inputTokens: number | null; outputTokens: number | null; costUsd: number | null },
): ProviderAnalysis {
  const e = raw?.extracted ?? {};
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
  const int = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : undefined);
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

  const language = LANG.has(raw?.language) ? raw.language : "OTHER";
  const intentType = INTENT.has(raw?.intent_type) ? raw.intent_type : "OTHER";
  const score = Math.max(0, Math.min(100, int(raw?.score) ?? 0));

  return {
    language,
    languageConfidence: num(raw?.language_confidence) ?? 0.5,
    hasCommercialIntent: raw?.has_commercial_intent === true,
    intentType,
    extracted: {
      company: str(e.company),
      country: str(e.country),
      city: str(e.city),
      material: str(e.material),
      stoneType: str(e.stone_type),
      color: str(e.color),
      thicknessCm: num(e.thickness_cm),
      finish: FINISH.has(e.finish) ? e.finish : undefined,
      quantitySlabs: int(e.quantity_slabs),
      squareMeters: num(e.square_meters),
      hasProject: e.has_project === true ? true : undefined,
      deadline: str(e.deadline),
      priceRange: str(e.price_range),
      urgency: ["low", "medium", "high"].includes(e.urgency) ? e.urgency : undefined,
    },
    score,
    temperature: score >= 81 ? "HOT" : score >= 61 ? "QUALIFIED" : score >= 31 ? "WARM" : "COLD",
    scoreFactors: Array.isArray(raw?.score_factors)
      ? raw.score_factors
          .filter((f: any) => f && typeof f.factor === "string")
          .map((f: any) => ({ factor: String(f.factor), weight: int(f.weight) ?? 0 }))
      : [],
    summary: str(raw?.summary) ?? null,
    suggestedReply: str(raw?.suggested_reply) ?? null,
    confidence: num(raw?.confidence) ?? 0.5,
    usage,
  };
}
