import { describe, expect, it } from "vitest";

import { headerSecretOk, nextBusinessWindow, signContext, timezoneFor, toE164, verifyContext } from "@/server/voice/config";
import { buildVoiceSystemPrompt, firstMessage } from "@/server/voice/prompt";

describe("contexto assinado da ligação", () => {
  const ctx = { o: "org1", k: "contact1", c: "conv1", l: "lead1", p: "scheduled" as const };
  it("ida e volta com o mesmo segredo", () => {
    expect(verifyContext(signContext(ctx, "s3cr3t"), "s3cr3t")).toEqual(ctx);
  });
  it("rejeita segredo errado, token adulterado ou vazio", () => {
    const t = signContext(ctx, "s3cr3t");
    expect(verifyContext(t, "outro")).toBeNull();
    const [body, sig] = t.split(".");
    const forged = Buffer.from(JSON.stringify({ ...ctx, o: "org2" })).toString("base64url");
    expect(verifyContext(`${forged}.${sig}`, "s3cr3t")).toBeNull();
    expect(verifyContext(`${body}.`, "s3cr3t")).toBeNull();
    expect(verifyContext(null, "s3cr3t")).toBeNull();
  });
});

describe("segredo do webhook no header", () => {
  it("aceita Authorization Bearer, X-Vapi-Secret e x-crm-secret", () => {
    expect(headerSecretOk(new Headers({ authorization: "Bearer abc" }), "abc")).toBe(true);
    expect(headerSecretOk(new Headers({ "x-vapi-secret": "abc" }), "abc")).toBe(true);
    expect(headerSecretOk(new Headers({ "x-crm-secret": "abc" }), "abc")).toBe(true);
  });
  it("recusa errado ou ausente", () => {
    expect(headerSecretOk(new Headers({ authorization: "Bearer xyz" }), "abc")).toBe(false);
    expect(headerSecretOk(new Headers(), "abc")).toBe(false);
    expect(headerSecretOk(new Headers({ authorization: "Bearer abc" }), "")).toBe(false);
  });
});

describe("toE164", () => {
  it("normaliza formatos comuns", () => {
    expect(toE164("+55 (27) 99999-0000")).toBe("+5527999990000");
    expect(toE164("5527999990000")).toBe("+5527999990000");
    expect(toE164("13055550100", { fromWhatsApp: true })).toBe("+13055550100"); // WhatsApp sempre tem DDI
    expect(toE164("+1 305 555 0100")).toBe("+13055550100");
    expect(toE164("0044 20 7946 0958")).toBe("+442079460958");
  });
  it("não chuta DDI", () => {
    expect(toE164("27 99999-0000")).toBeNull();
    expect(toE164("13055550100")).toBeNull(); // sem "+" e sem ser WhatsApp, não dá para saber o país
    expect(toE164("123")).toBeNull();
    expect(toE164(null)).toBeNull();
  });
});

describe("fuso e horário comercial", () => {
  it("escolhe fuso pelo país ou pelo DDI", () => {
    expect(timezoneFor("US", null)).toBe("America/New_York");
    expect(timezoneFor("Estados Unidos", null)).toBe("America/New_York");
    expect(timezoneFor(null, "+34600000000")).toBe("Europe/Madrid");
    expect(timezoneFor(null, "+351910000000")).toBe("Europe/Lisbon");
    expect(timezoneFor(null, null)).toBe("America/Sao_Paulo");
  });
  it("sexta à noite em NY → segunda 10h–17h NY", () => {
    const fri = new Date("2026-11-06T23:30:00Z"); // 18:30 em NY
    const w = nextBusinessWindow(fri, "America/New_York");
    expect(w.earliestAt.toISOString()).toBe("2026-11-09T15:00:00.000Z"); // 10:00 EST
    expect(w.latestAt.toISOString()).toBe("2026-11-09T22:00:00.000Z");
  });
  it("dentro da janela começa agora", () => {
    const now = new Date("2026-11-05T14:00:00Z"); // 11:00 em São Paulo, quinta
    const w = nextBusinessWindow(now, "America/Sao_Paulo");
    expect(w.earliestAt.getTime()).toBe(now.getTime());
    expect(w.latestAt.toISOString()).toBe("2026-11-05T20:00:00.000Z");
  });
});

describe("prompt e saudação de voz", () => {
  it("mantém as regras do SDR e o objetivo da ligação", () => {
    const p = buildVoiceSystemPrompt({
      agentName: "Ana",
      companyName: "Toledo Mineração",
      knowledgeBase: "Black Taurus",
      qualificationCriteria: "",
      purpose: "reactivation",
      nowIso: "2026-11-05T14:00:00Z",
      contact: { name: "John", country: "US", language: "EN" },
      lead: null,
      recentChat: "CLIENTE: Do you have Black Taurus?",
    });
    expect(p).toContain("Nunca informe preço");
    expect(p).toContain("do_not_call");
    expect(p).toContain("aceitou receber ligação");
    expect(p).toContain("Do you have Black Taurus?");
  });
  it("saúda no idioma e não usa nome genérico", () => {
    expect(firstMessage("PT", "scheduled", "Ana", "Toledo", "Carlos Lima")).toContain("Olá, Carlos!");
    expect(firstMessage("EN", "inbound", "Ana", "Toledo", null)).toContain("How can I help");
    expect(firstMessage(null, "inbound", "Ana", "Toledo", null)).toContain("Bom dia");
    expect(firstMessage("ES", "reactivation", "Ana", "Toledo", "Contato WHATSAPP")).not.toContain("Contato");
  });
});
