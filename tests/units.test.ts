import { describe, expect, it } from "vitest";

import { detectLanguage } from "@/server/leads/language";
import { detectIntent } from "@/server/leads/intent";
import { scoreLead, temperatureFor } from "@/server/leads/scoring";
import { routeLead } from "@/server/leads/routing";
import { extractLeadFields } from "@/server/leads/extract";

describe("detectLanguage", () => {
  it("reconhece português com diacríticos", () => {
    expect(detectLanguage("Olá, gostaria de saber o preço do Taj Mahal.").language).toBe("PT");
  });
  it("reconhece espanhol", () => {
    expect(detectLanguage("Hola, estoy buscando Taj Mahal para un proyecto.").language).toBe("ES");
  });
  it("reconhece inglês", () => {
    expect(detectLanguage("Hello, I'm looking for 100 sqm of Taj Mahal quartzite.").language).toBe("EN");
  });
  it("conversa mista: pega o idioma predominante do corpo comercial", () => {
    expect(detectLanguage("Hello! Hola! I'm looking for Taj Mahal slabs for my project.").language).toBe("EN");
  });
  it("mensagem só com emoji cai em OTHER", () => {
    expect(detectLanguage("🔥🔥🔥").language).toBe("OTHER");
  });
});

describe("detectIntent", () => {
  it("elogio puro não tem intenção comercial", () => {
    expect(detectIntent("Linda pedra!").hasCommercialIntent).toBe(false);
    expect(detectIntent("Beautiful!").hasCommercialIntent).toBe(false);
  });
  it("pergunta de preço tem intenção", () => {
    expect(detectIntent("¿Cuál es el precio por m²?").hasCommercialIntent).toBe(true);
  });
  it("pedido de amostra tem intenção", () => {
    const r = detectIntent("Could you send me a sample?");
    expect(r.hasCommercialIntent).toBe(true);
    expect(r.intentType).toBe("SAMPLE");
  });
  it("pergunta de exportação tem intenção", () => {
    expect(detectIntent("Do you ship to Miami?").hasCommercialIntent).toBe(true);
  });
});

describe("scoreLead", () => {
  it("frio quando quase não há sinais", () => {
    const r = scoreLead({ askedAvailability: true });
    expect(r.temperature).toBe("COLD");
  });
  it("quente com preço + material + quantidade + projeto + compra", () => {
    const r = scoreLead({
      askedPrice: true,
      requestedQuote: true,
      hasMaterial: true,
      hasQuantity: true,
      hasProject: true,
      hasCity: true,
      explicitBuyingIntent: true,
    });
    expect(r.score).toBeGreaterThanOrEqual(81);
    expect(r.temperature).toBe("HOT");
  });
  it("faixas de temperatura", () => {
    expect(temperatureFor(0)).toBe("COLD");
    expect(temperatureFor(45)).toBe("WARM");
    expect(temperatureFor(70)).toBe("QUALIFIED");
    expect(temperatureFor(90)).toBe("HOT");
  });
});

describe("extractLeadFields", () => {
  it("extrai material, espessura, acabamento, m² e cidade da frase do item 18", () => {
    const r = extractLeadFields(
      "Hi, I'm looking for 100 square meters of Taj Mahal quartzite, 3 cm polished, for a project in Miami.",
    );
    expect(r.material).toBe("Taj Mahal");
    expect(r.thicknessCm).toBe(3);
    expect(r.finish).toBe("POLISHED");
    expect(r.squareMeters).toBe(100);
    expect(r.hasProject).toBe(true);
    expect(r.city).toBe("Miami");
  });

  it("converte mm para cm", () => {
    expect(extractLeadFields("preciso de chapas de 20 mm").thicknessCm).toBe(2);
  });

  it("não inventa: frase vaga volta quase vazia", () => {
    const r = extractLeadFields("Do you have natural stone?");
    expect(r.material).toBeUndefined();
    expect(r.squareMeters).toBeUndefined();
    expect(r.asRecord).toEqual({});
  });

  it("conta chapas", () => {
    expect(extractLeadFields("quero 8 chapas de Super White").quantitySlabs).toBe(8);
    expect(extractLeadFields("quero 8 chapas de Super White").material).toBe("Super White");
  });
});

describe("routeLead", () => {
  const rules = [
    { language: "PT" as const, sellerId: "r", active: true },
    { language: "ES" as const, sellerId: "g", active: true },
    { language: "EN" as const, sellerId: "g", active: true },
  ];
  it("idioma sem regra vai para triagem", () => {
    const r = routeLead("OTHER", rules, "triage");
    expect(r.isTriage).toBe(true);
    expect(r.sellerId).toBe("triage");
  });
  it("regra inativa é ignorada", () => {
    const r = routeLead("PT", [{ language: "PT", sellerId: "r", active: false }], "triage");
    expect(r.isTriage).toBe(true);
  });
});
