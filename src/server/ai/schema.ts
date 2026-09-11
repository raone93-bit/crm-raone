import type { Finish, IntentType, Language, LeadTemperature } from "@prisma/client";

/**
 * Contrato de saída da análise de uma conversa (item 16-18).
 * O mesmo formato vale para a heurística determinística e para qualquer
 * provedor de IA — é isso que torna o provedor trocável (item 43).
 */

export type ExtractedFields = {
  company?: string;
  country?: string;
  city?: string;
  material?: string;
  stoneType?: string;
  color?: string;
  thicknessCm?: number;
  finish?: Finish;
  quantitySlabs?: number;
  squareMeters?: number;
  hasProject?: boolean;
  deadline?: string;
  priceRange?: string;
  urgency?: "low" | "medium" | "high";
};

export type AnalysisResult = {
  source: "heuristic" | "ai" | "ai+heuristic";
  language: Language;
  languageConfidence: number;
  hasCommercialIntent: boolean;
  intentType: IntentType;
  extracted: ExtractedFields;
  score: number;
  temperature: LeadTemperature;
  scoreFactors: { factor: string; weight: number }[];
  summary: string | null;
  suggestedReply: string | null;
  /** Confiança geral da classificação. Baixo → fila de triagem. */
  confidence: number;
  needsTriage: boolean;
  usage: {
    provider: "ANTHROPIC" | "OPENAI" | null;
    model: string | null;
    inputTokens: number | null;
    outputTokens: number | null;
    costUsd: number | null;
  };
};

/** O que o provedor de IA devolve (subconjunto — o merge cuida do resto). */
export type ProviderAnalysis = {
  language: Language;
  languageConfidence: number;
  hasCommercialIntent: boolean;
  intentType: IntentType;
  extracted: ExtractedFields;
  score: number;
  temperature: LeadTemperature;
  scoreFactors: { factor: string; weight: number }[];
  summary: string | null;
  suggestedReply: string | null;
  confidence: number;
  usage: {
    inputTokens: number | null;
    outputTokens: number | null;
    costUsd: number | null;
  };
};

export type AnalyzeInput = {
  /** Conversa em ordem cronológica (mais antiga primeiro). */
  messages: { role: "customer" | "seller"; text: string }[];
  knownContact: {
    displayName: string | null;
    country: string | null;
    language: Language | null;
  };
  /** Nomes de material do catálogo, para a IA reconhecer (item 40: só o que existe). */
  catalogHints: string[];
};

/** JSON Schema do resultado — usado como forced tool no provedor. */
export const ANALYSIS_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    language: { type: "string", enum: ["PT", "ES", "EN", "OTHER"] },
    language_confidence: { type: "number", minimum: 0, maximum: 1 },
    has_commercial_intent: { type: "boolean" },
    intent_type: {
      type: "string",
      enum: ["PRICE", "AVAILABILITY", "SAMPLE", "QUOTE", "FREIGHT", "EXPORT", "PROJECT", "MEDIA_REQUEST", "GREETING", "OTHER"],
    },
    extracted: {
      type: "object",
      additionalProperties: false,
      properties: {
        company: { type: ["string", "null"] },
        country: { type: ["string", "null"] },
        city: { type: ["string", "null"] },
        material: { type: ["string", "null"] },
        stone_type: { type: ["string", "null"] },
        color: { type: ["string", "null"] },
        thickness_cm: { type: ["number", "null"] },
        finish: { type: ["string", "null"], enum: ["POLISHED", "HONED", "LEATHER", "BRUSHED", "SANDBLASTED", "SAWN", "OTHER", null] },
        quantity_slabs: { type: ["integer", "null"] },
        square_meters: { type: ["number", "null"] },
        has_project: { type: ["boolean", "null"] },
        deadline: { type: ["string", "null"] },
        price_range: { type: ["string", "null"] },
        urgency: { type: ["string", "null"], enum: ["low", "medium", "high", null] },
      },
      required: [],
    },
    score: { type: "integer", minimum: 0, maximum: 100 },
    score_factors: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: { factor: { type: "string" }, weight: { type: "integer" } },
        required: ["factor", "weight"],
      },
    },
    summary: { type: ["string", "null"] },
    suggested_reply: { type: ["string", "null"] },
    confidence: { type: "number", minimum: 0, maximum: 1 },
  },
  required: [
    "language",
    "language_confidence",
    "has_commercial_intent",
    "intent_type",
    "extracted",
    "score",
    "score_factors",
    "confidence",
  ],
} as const;
