import type { Language } from "@prisma/client";

import { detectIntent, type IntentResult } from "./intent";
import { detectLanguage } from "./language";
import { routeLead, type RoutingRuleInput, type RoutingResult } from "./routing";
import { scoreLead, type ScoreSignals } from "./scoring";

/**
 * Orquestra a qualificação determinística de UMA mensagem, sem tocar no banco.
 * É a versão que roda antes da IA (Fase 4) e a base dos testes obrigatórios
 * (item 50). A Fase 4 troca `detectIntent` / `detectLanguage` / extração pela
 * análise do LLM, mantendo este mesmo contrato de saída.
 */

export type QualifyInput = {
  text: string;
  rules: RoutingRuleInput[];
  triageSellerId: string | null;
  /** Sinais extraídos do texto ou já conhecidos do contato/lead. */
  signals?: ScoreSignals;
  /** Extração de dados; vazio = não informado. A IA NUNCA inventa (item 40). */
  extracted?: Record<string, unknown>;
};

export type QualifyResult = {
  hasCommercialIntent: boolean;
  intent: IntentResult;
  language: Language;
  languageConfidence: number;
  routing: RoutingResult | null;
  score: number;
  temperature: ReturnType<typeof scoreLead>["temperature"];
  scoreFactors: ReturnType<typeof scoreLead>["factors"];
  extracted: Record<string, unknown>;
};

const SIGNAL_FROM_INTENT: Record<string, keyof ScoreSignals> = {
  PRICE: "askedPrice",
  AVAILABILITY: "askedAvailability",
  QUOTE: "requestedQuote",
  SAMPLE: "requestedSample",
  MEDIA_REQUEST: "requestedMedia",
  FREIGHT: "askedFreight",
  PROJECT: "hasProject",
};

export function qualifyMessage(input: QualifyInput): QualifyResult {
  const intent = detectIntent(input.text);
  const { language, confidence } = detectLanguage(input.text);
  const extracted = input.extracted ?? {};

  if (!intent.hasCommercialIntent) {
    return {
      hasCommercialIntent: false,
      intent,
      language,
      languageConfidence: confidence,
      routing: null,
      score: 0,
      temperature: "COLD",
      scoreFactors: [],
      extracted,
    };
  }

  // Deriva sinais de score a partir dos tipos de intenção detectados.
  const derived: ScoreSignals = { ...input.signals };
  for (const t of intent.matched) {
    const key = SIGNAL_FROM_INTENT[t];
    if (key) derived[key] = true;
  }
  if (extracted.material || extracted.materialText) derived.hasMaterial = true;
  if (extracted.quantity || extracted.squareMeters) derived.hasQuantity = true;
  if (extracted.city) derived.hasCity = true;
  if (extracted.deadline) derived.hasDeadline = true;
  if (extracted.company) derived.hasCompany = true;

  const { score, temperature, factors } = scoreLead(derived);
  const routing = routeLead(language, input.rules, input.triageSellerId);

  return {
    hasCommercialIntent: true,
    intent,
    language,
    languageConfidence: confidence,
    routing,
    score,
    temperature,
    scoreFactors: factors,
    extracted,
  };
}
