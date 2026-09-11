import type { LeadTemperature } from "@prisma/client";

/**
 * Lead score 0–100 (item 19).
 *   0–30   frio        (COLD)
 *   31–60  morno       (WARM)
 *   61–80  qualificado (QUALIFIED)
 *   81–100 quente      (HOT)
 */

export type ScoreSignals = {
  askedPrice?: boolean;
  askedAvailability?: boolean;
  requestedQuote?: boolean;
  requestedSample?: boolean;
  requestedMedia?: boolean;
  hasMaterial?: boolean;
  hasQuantity?: boolean;
  hasProject?: boolean;
  hasCity?: boolean;
  hasDeadline?: boolean;
  hasCompany?: boolean;
  explicitBuyingIntent?: boolean;
  askedFreight?: boolean;
  repliedAfterQuote?: boolean;
  fastReplies?: boolean;
  priorInteraction?: boolean;
};

type Factor = { factor: string; weight: number };

const WEIGHTS: { key: keyof ScoreSignals; factor: string; weight: number }[] = [
  { key: "askedPrice", factor: "Pediu preço", weight: 14 },
  { key: "askedAvailability", factor: "Pediu disponibilidade", weight: 10 },
  { key: "requestedQuote", factor: "Pediu cotação", weight: 16 },
  { key: "requestedSample", factor: "Pediu amostra", weight: 12 },
  { key: "requestedMedia", factor: "Pediu fotos/vídeo", weight: 6 },
  { key: "hasMaterial", factor: "Material definido", weight: 12 },
  { key: "hasQuantity", factor: "Quantidade definida", weight: 12 },
  { key: "hasProject", factor: "Projeto identificado", weight: 10 },
  { key: "hasCity", factor: "Cidade identificada", weight: 5 },
  { key: "hasDeadline", factor: "Prazo informado", weight: 6 },
  { key: "hasCompany", factor: "Empresa identificada", weight: 6 },
  { key: "explicitBuyingIntent", factor: "Intenção de compra explícita", weight: 14 },
  { key: "askedFreight", factor: "Perguntou sobre frete", weight: 6 },
  { key: "repliedAfterQuote", factor: "Retornou após cotação", weight: 12 },
  { key: "fastReplies", factor: "Respostas rápidas", weight: 4 },
  { key: "priorInteraction", factor: "Histórico de interação", weight: 5 },
];

export function scoreLead(signals: ScoreSignals): {
  score: number;
  temperature: LeadTemperature;
  factors: Factor[];
} {
  const factors: Factor[] = [];
  let raw = 0;
  for (const w of WEIGHTS) {
    if (signals[w.key]) {
      raw += w.weight;
      factors.push({ factor: w.factor, weight: w.weight });
    }
  }
  const score = Math.max(0, Math.min(100, raw));
  return { score, temperature: temperatureFor(score), factors };
}

export function temperatureFor(score: number): LeadTemperature {
  if (score >= 81) return "HOT";
  if (score >= 61) return "QUALIFIED";
  if (score >= 31) return "WARM";
  return "COLD";
}
