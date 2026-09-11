import { describe, expect, it } from "vitest";

import {
  heuristicAnalysis,
  mergeAnalyses,
  scrubSuggestedReply,
} from "@/server/ai/analyze";
import type { ProviderAnalysis } from "@/server/ai/schema";

describe("heuristicAnalysis (fallback sem IA)", () => {
  it("mantém a regra de intenção comercial", () => {
    expect(heuristicAnalysis("Olá, vocês têm Taj Mahal?").hasCommercialIntent).toBe(true);
    expect(heuristicAnalysis("Linda pedra!").hasCommercialIntent).toBe(false);
  });
  it("não gera resumo nem resposta sugerida (isso é da IA)", () => {
    const r = heuristicAnalysis("Do you have Taj Mahal 3 cm?");
    expect(r.summary).toBeNull();
    expect(r.suggestedReply).toBeNull();
    expect(r.source).toBe("heuristic");
    expect(r.language).toBe("EN");
  });
  it("lead sem dados fica frio", () => {
    const r = heuristicAnalysis("Hi, do you sell natural stone?");
    expect(r.hasCommercialIntent).toBe(true);
    expect(r.temperature).toBe("COLD");
  });
});

describe("mergeAnalyses", () => {
  const heuristic = heuristicAnalysis("Hi, do you have Taj Mahal slabs?");

  const ai: ProviderAnalysis = {
    language: "EN",
    languageConfidence: 0.95,
    hasCommercialIntent: true,
    intentType: "QUOTE",
    extracted: { material: "Taj Mahal", squareMeters: 120, city: "Miami" },
    score: 78,
    temperature: "QUALIFIED",
    scoreFactors: [{ factor: "Pediu cotação", weight: 16 }],
    summary: "Cliente quer 120 m² de Taj Mahal para projeto em Miami.",
    suggestedReply: "We can check availability of Taj Mahal. Could you confirm the thickness and destination port?",
    confidence: 0.9,
    usage: { inputTokens: 800, outputTokens: 120, costUsd: 0.0014 },
  };

  it("a IA manda no idioma, intenção, resumo e resposta", () => {
    const m = mergeAnalyses(heuristic, ai, "ANTHROPIC");
    expect(m.source).toBe("ai+heuristic");
    expect(m.intentType).toBe("QUOTE");
    expect(m.summary).toContain("Taj Mahal");
    expect(m.suggestedReply).toBeTruthy();
    expect(m.usage.provider).toBe("ANTHROPIC");
  });

  it("score é o maior entre IA e heurística", () => {
    const m = mergeAnalyses({ ...heuristic, score: 90 }, ai, "ANTHROPIC");
    expect(m.score).toBe(90);
  });

  it("a extração é união — a IA não zera o que a heurística achou", () => {
    const h = { ...heuristic, extracted: { ...heuristic.extracted, thicknessCm: 3 } };
    const m = mergeAnalyses(h, { ...ai, extracted: { material: "Taj Mahal" } }, "ANTHROPIC");
    expect(m.extracted.thicknessCm).toBe(3);
    expect(m.extracted.material).toBe("Taj Mahal");
  });
});

describe("scrubSuggestedReply (guardrail item 40)", () => {
  it("mantém resposta que não afirma preço/estoque/prazo", () => {
    const s = "We can check our current availability. How many square meters do you need, and to which port?";
    expect(scrubSuggestedReply(s, false)).toBe(s);
  });
  it("descarta resposta que inventa preço", () => {
    expect(scrubSuggestedReply("Yes, Taj Mahal is $80 per m² and in stock now.", false)).toBeNull();
  });
  it("descarta resposta que inventa prazo", () => {
    expect(scrubSuggestedReply("Sure, delivery in 5 business days.", false)).toBeNull();
  });
  it("permite preço quando há cotação real", () => {
    const s = "As per our quote, Taj Mahal is $80 per m².";
    expect(scrubSuggestedReply(s, true)).toBe(s);
  });
});
