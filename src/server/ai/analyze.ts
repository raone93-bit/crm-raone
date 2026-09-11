import type { Language } from "@prisma/client";

import { detectIntent } from "@/server/leads/intent";
import { detectLanguage } from "@/server/leads/language";
import { extractLeadFields } from "@/server/leads/extract";
import { scoreLead, temperatureFor, type ScoreSignals } from "@/server/leads/scoring";
import type { AnalysisResult, AnalyzeInput, ExtractedFields, ProviderAnalysis } from "./schema";

const INTENT_SIGNAL: Record<string, keyof ScoreSignals> = {
  PRICE: "askedPrice",
  AVAILABILITY: "askedAvailability",
  QUOTE: "requestedQuote",
  SAMPLE: "requestedSample",
  MEDIA_REQUEST: "requestedMedia",
  FREIGHT: "askedFreight",
  PROJECT: "hasProject",
};

/** Análise 100% determinística — roda sempre, é o piso e o fallback. */
export function heuristicAnalysis(text: string): AnalysisResult {
  const intent = detectIntent(text);
  const lang = detectLanguage(text);
  const ex = extractLeadFields(text);

  const signals: ScoreSignals = {};
  for (const t of intent.matched) {
    const k = INTENT_SIGNAL[t];
    if (k) signals[k] = true;
  }
  if (ex.material) signals.hasMaterial = true;
  if (ex.squareMeters || ex.quantitySlabs) signals.hasQuantity = true;
  if (ex.city) signals.hasCity = true;
  if (ex.hasProject) signals.hasProject = true;

  const { score, temperature, factors } = intent.hasCommercialIntent
    ? scoreLead(signals)
    : { score: 0, temperature: "COLD" as const, factors: [] };

  const extracted: ExtractedFields = {
    material: ex.material,
    thicknessCm: ex.thicknessCm,
    finish: ex.finish,
    quantitySlabs: ex.quantitySlabs,
    squareMeters: ex.squareMeters,
    city: ex.city,
    hasProject: ex.hasProject || undefined,
  };

  return {
    source: "heuristic",
    language: lang.language,
    languageConfidence: lang.confidence,
    hasCommercialIntent: intent.hasCommercialIntent,
    intentType: intent.intentType,
    extracted,
    score,
    temperature,
    scoreFactors: factors,
    summary: null,
    suggestedReply: null,
    confidence: intent.hasCommercialIntent ? Math.min(0.7, 0.4 + lang.confidence * 0.3) : 0.55,
    needsTriage: lang.language === "OTHER",
    usage: { provider: null, model: null, inputTokens: null, outputTokens: null, costUsd: null },
  };
}

/** Junta IA + heurística. A IA manda no idioma/intenção/resumo/resposta; a
 *  extração é a união (a IA nunca zera o que a heurística achou). */
export function mergeAnalyses(
  heuristic: AnalysisResult,
  ai: ProviderAnalysis,
  providerName: "ANTHROPIC" | "OPENAI",
): AnalysisResult {
  const extracted: ExtractedFields = { ...heuristic.extracted };
  for (const [key, value] of Object.entries(ai.extracted)) {
    if (value !== undefined && value !== null && value !== "") {
      (extracted as Record<string, unknown>)[key] = value;
    }
  }

  const score = Math.max(heuristic.score, ai.score);
  const language: Language =
    ai.languageConfidence >= 0.55 ? ai.language : heuristic.languageConfidence >= 0.6 ? heuristic.language : ai.language;

  return {
    source: "ai+heuristic",
    language,
    languageConfidence: Math.max(ai.languageConfidence, heuristic.languageConfidence),
    hasCommercialIntent: ai.hasCommercialIntent,
    intentType: ai.intentType,
    extracted,
    score,
    temperature: temperatureFor(score),
    scoreFactors: ai.scoreFactors.length ? ai.scoreFactors : heuristic.scoreFactors,
    summary: ai.summary,
    suggestedReply: scrubSuggestedReply(ai.suggestedReply, false),
    confidence: ai.confidence,
    needsTriage: ai.confidence < 0.45 || language === "OTHER",
    usage: {
      provider: providerName,
      model: null,
      inputTokens: ai.usage.inputTokens,
      outputTokens: ai.usage.outputTokens,
      costUsd: ai.usage.costUsd,
    },
  };
}

/**
 * Guardrail (item 40): a IA nunca deve afirmar preço, estoque, prazo ou frete.
 * Se a resposta sugerida contém um valor específico e não temos cotação real,
 * a resposta é descartada — o vendedor escreve.
 */
export function scrubSuggestedReply(reply: string | null, hasRealQuote: boolean): string | null {
  if (!reply) return null;
  if (hasRealQuote) return reply;

  const claimsPrice = /(\$|R\$|€|usd|eur|brl)\s?\d|\d+\s?(\/m²|\/m2|per m2|per sqm|por m²|reais|d[oó]lares)/i.test(reply);
  const claimsStock = /(temos em estoque|in stock now|dispon[ií]vel agora|available now|pronta entrega|ready to ship this week)/i.test(reply);
  const claimsLeadTime = /(entrega em \d|delivery in \d|\d+\s?(dias [uú]teis|business days|weeks)\s+para)/i.test(reply);

  if (claimsPrice || claimsStock || claimsLeadTime) return null;
  return reply;
}

/**
 * Análise de uma conversa. Nunca lança — se a IA falhar, devolve a heurística.
 */
export async function analyzeConversation(
  input: AnalyzeInput,
  opts: { latestText: string } ,
): Promise<AnalysisResult> {
  const heuristic = heuristicAnalysis(opts.latestText);
  const { getProvider } = await import("./index");
  const provider = getProvider();
  if (!provider) return heuristic;

  try {
    const ai = await provider.analyzeConversation(input);
    const merged = mergeAnalyses(heuristic, ai, provider.name);
    merged.usage.model = provider.model;
    return merged;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[ai] análise falhou, usando heurística:", err instanceof Error ? err.message : err);
    return { ...heuristic, needsTriage: heuristic.needsTriage };
  }
}
