import { describe, expect, it } from "vitest";

import { qualifyMessage } from "@/server/leads/qualify";
import { findDuplicate, type Candidate } from "@/server/leads/dedupe";

/**
 * TESTES OBRIGATÓRIOS — item 50 do briefing.
 * Todos precisam passar antes de qualquer deploy.
 */

const RODOLFO = "seller_rodolfo";
const GABRIEL = "seller_gabriel";
const TRIAGE = "seller_triage";

const RULES = [
  { language: "PT" as const, sellerId: RODOLFO, active: true },
  { language: "ES" as const, sellerId: GABRIEL, active: true },
  { language: "EN" as const, sellerId: GABRIEL, active: true },
];

function qualify(text: string, extracted?: Record<string, unknown>) {
  return qualifyMessage({ text, rules: RULES, triageSellerId: TRIAGE, extracted });
}

describe("Testes obrigatórios", () => {
  it("TESTE 1 — português: cria lead e roteia para Rodolfo", () => {
    const r = qualify("Olá, vocês têm Taj Mahal?");
    expect(r.hasCommercialIntent).toBe(true);
    expect(r.language).toBe("PT");
    expect(r.routing?.sellerId).toBe(RODOLFO);
    expect(r.routing?.isTriage).toBe(false);
  });

  it("TESTE 2 — espanhol: cria lead e roteia para Gabriel", () => {
    const r = qualify("Hola, ¿tienen Taj Mahal?");
    expect(r.hasCommercialIntent).toBe(true);
    expect(r.language).toBe("ES");
    expect(r.routing?.sellerId).toBe(GABRIEL);
  });

  it("TESTE 3 — inglês: cria lead e roteia para Gabriel", () => {
    const r = qualify("Do you have Taj Mahal slabs?");
    expect(r.hasCommercialIntent).toBe(true);
    expect(r.language).toBe("EN");
    expect(r.routing?.sellerId).toBe(GABRIEL);
  });

  it("TESTE 4 — sem intenção comercial: não cria lead", () => {
    const r = qualify("Linda pedra!");
    expect(r.hasCommercialIntent).toBe(false);
    expect(r.routing).toBeNull();
  });

  it("TESTE 5 — mesma pessoa no Instagram e no WhatsApp: não duplica", () => {
    const existing: Candidate[] = [
      {
        contactId: "c_john",
        displayName: "John Smith",
        phone: "+13055551234",
        email: null,
        country: "US",
        identities: [{ channel: "INSTAGRAM", externalId: "ig_998877", handle: "johnsmith" }],
        lastActivityAt: new Date(),
      },
    ];

    // Chega pelo WhatsApp com o mesmo telefone → anexa ao contato existente.
    const byPhone = findDuplicate(
      { channel: "WHATSAPP", externalId: "+13055551234", name: "John Smith", phone: "+13055551234", country: "US" },
      existing,
    );
    expect(byPhone.contactId).toBe("c_john");
    expect(byPhone.action).toBe("attach");

    // Sem telefone, só nome + país + recência → sinaliza possível duplicata (não cria cegamente).
    const byName = findDuplicate(
      { channel: "WHATSAPP", externalId: "wa_555", name: "John Smith", country: "US" },
      existing,
    );
    expect(byName.contactId).toBe("c_john");
    expect(["flag", "attach"]).toContain(byName.action);
  });

  it("TESTE 6 — comentário com intenção comercial: cria lead", () => {
    const r = qualify("How much is this slab?");
    expect(r.hasCommercialIntent).toBe(true);
    expect(r.intent.intentType).toBe("PRICE");
  });

  it("TESTE 7 — intenção sem dados suficientes: cria lead, score baixo, sem inventar", () => {
    const r = qualify("Hi, do you sell natural stone? I might need some.");
    expect(r.hasCommercialIntent).toBe(true);
    expect(r.extracted).toEqual({});
    expect(r.score).toBeLessThanOrEqual(30);
    expect(r.temperature).toBe("COLD");
  });

  it("qualifica lead quente com todos os dados (item 18)", () => {
    const r = qualify(
      "Hi, I'm looking for 100 square meters of Taj Mahal quartzite, 3 cm polished, for a project in Miami.",
      { material: "Taj Mahal", squareMeters: 100, city: "Miami" },
    );
    expect(r.language).toBe("EN");
    expect(r.routing?.sellerId).toBe(GABRIEL);
    expect(r.score).toBeGreaterThanOrEqual(31);
  });
});
