import { describe, expect, it } from "vitest";

import { asksForHuman, checkReply, decideAutoReply, detectOptOut, type AutoReplyInput } from "@/server/sdr/guards";
import { toClaudeMessages } from "@/server/sdr/history";
import { buildSdrSystemPrompt } from "@/server/sdr/prompt";

const now = new Date("2026-11-05T13:00:00Z");
const base: AutoReplyInput = {
  settings: { enabled: true, channels: ["WHATSAPP", "INSTAGRAM", "FACEBOOK"], maxRepliesPerDay: 15 },
  aiConfigured: true,
  channel: "WHATSAPP",
  conversation: { aiPaused: false, status: "OPEN" },
  contactBlocked: false,
  isLatestInbound: true,
  alreadyAnswered: false,
  lastInboundAt: new Date("2026-11-05T12:59:00Z"),
  aiRepliesLast24h: 0,
  now,
};

describe("decideAutoReply — quando o agente pode responder", () => {
  it("responde no caso normal", () => {
    expect(decideAutoReply(base).ok).toBe(true);
  });
  it("não responde desligado, sem chave ou sem configuração", () => {
    expect(decideAutoReply({ ...base, settings: null }).ok).toBe(false);
    expect(decideAutoReply({ ...base, settings: { ...base.settings!, enabled: false } }).ok).toBe(false);
    expect(decideAutoReply({ ...base, aiConfigured: false }).ok).toBe(false);
  });
  it("nunca responde e-mail (piloto automático só nos canais da Meta)", () => {
    const r = decideAutoReply({ ...base, channel: "EMAIL", settings: { ...base.settings!, channels: ["EMAIL" as never] } });
    expect(r.ok).toBe(false);
  });
  it("respeita canal desmarcado", () => {
    expect(decideAutoReply({ ...base, channel: "INSTAGRAM", settings: { ...base.settings!, channels: ["WHATSAPP"] } }).ok).toBe(false);
  });
  it("sai da conversa quando pausado (humano assumiu) ou fechada", () => {
    expect(decideAutoReply({ ...base, conversation: { aiPaused: true, status: "OPEN" } }).ok).toBe(false);
    expect(decideAutoReply({ ...base, conversation: { aiPaused: false, status: "CLOSED" } }).ok).toBe(false);
  });
  it("debounce: só a mensagem mais nova dispara; não responde duas vezes", () => {
    expect(decideAutoReply({ ...base, isLatestInbound: false }).ok).toBe(false);
    expect(decideAutoReply({ ...base, alreadyAnswered: true }).ok).toBe(false);
  });
  it("fora da janela de 24 h da Meta não responde", () => {
    expect(decideAutoReply({ ...base, lastInboundAt: new Date("2026-11-04T12:00:00Z") }).ok).toBe(false);
  });
  it("anti-loop: teto de respostas por conversa", () => {
    expect(decideAutoReply({ ...base, aiRepliesLast24h: 15 }).ok).toBe(false);
  });
  it("contato bloqueado", () => {
    expect(decideAutoReply({ ...base, contactBlocked: true }).ok).toBe(false);
  });
});

describe("checkReply — guardrail de preço, prazo, pagamento e estoque", () => {
  const ok = (t: string, availabilityChecked = false) => checkReply(t, { availabilityChecked }).ok;

  it("deixa passar resposta de qualificação", () => {
    expect(ok("Great! Which thickness do you need, 2 cm or 3 cm? And what's the destination port?")).toBe(true);
    expect(ok("¡Hola! ¿Para qué proyecto es el material?")).toBe(true);
  });
  it("bloqueia preço em qualquer formato", () => {
    expect(ok("It's USD 85 per m2 FOB")).toBe(false);
    expect(ok("Fica R$ 450 o metro")).toBe(false);
    expect(ok("around $90/sqft")).toBe(false);
    expect(ok("Sale 120 dólares")).toBe(false);
  });
  it("bloqueia prazo de entrega/embarque", () => {
    expect(ok("We can ship in 15 days")).toBe(false);
    expect(ok("Embarque em 20 dias")).toBe(false);
    expect(ok("30 days for delivery")).toBe(false);
  });
  it("bloqueia condição de pagamento", () => {
    expect(ok("We work with 30% advance and the balance against BL")).toBe(false);
  });
  it("estoque só com consulta real", () => {
    expect(ok("Yes, we have it in stock!")).toBe(false);
    expect(ok("Yes, we have it in stock!", true)).toBe(true);
  });
  it("vazio ou longo demais não sai", () => {
    expect(ok("  ")).toBe(false);
    expect(ok("a".repeat(1300))).toBe(false);
  });
});

describe("opt-out e pedido de humano", () => {
  it("reconhece pedido para parar", () => {
    expect(detectOptOut("STOP")).toBe(true);
    expect(detectOptOut("Pare")).toBe(true);
    expect(detectOptOut("não quero mais receber mensagens")).toBe(true);
    expect(detectOptOut("please don't message me again")).toBe(true);
    expect(detectOptOut("Stop by our showroom?")).toBe(false);
    expect(detectOptOut("Do you have Taj Mahal?")).toBe(false);
  });
  it("reconhece pedido de pessoa", () => {
    expect(asksForHuman("Quero falar com um vendedor")).toBe(true);
    expect(asksForHuman("Can I talk to a human?")).toBe(true);
    expect(asksForHuman("Quiero hablar con un asesor")).toBe(true);
    expect(asksForHuman("Do you have 3 cm?")).toBe(false);
  });
});

describe("toClaudeMessages", () => {
  it("junta mensagens seguidas do mesmo lado e começa pelo cliente", () => {
    const m = toClaudeMessages([
      { direction: "OUTBOUND", text: "Template de boas-vindas", type: "TEXT" },
      { direction: "INBOUND", text: "Hi", type: "TEXT" },
      { direction: "INBOUND", text: "Do you have Black Taurus?", type: "TEXT" },
      { direction: "OUTBOUND", text: "Hello! Which thickness?", type: "TEXT" },
      { direction: "INBOUND", text: null, type: "IMAGE" },
    ]);
    expect(m.map((x) => x.role)).toEqual(["user", "assistant", "user"]);
    expect(m[0].content).toBe("Hi\nDo you have Black Taurus?");
    expect(m[2].content).toBe("[image enviado]");
  });
});

describe("buildSdrSystemPrompt", () => {
  it("carrega base de conhecimento, critérios e regras de nunca informar preço", () => {
    const p = buildSdrSystemPrompt({
      agentName: "Ana",
      companyName: "Toledo Mineração",
      knowledgeBase: "Black Taurus — granito preto",
      qualificationCriteria: "Importador nos EUA",
      channel: "WhatsApp",
      nowIso: now.toISOString(),
      lead: null,
      contact: { name: "John", country: "US", language: "EN" },
    });
    expect(p).toContain("Black Taurus");
    expect(p).toContain("Importador nos EUA");
    expect(p).toContain("Nunca informa preço");
    expect(p).toContain("send_reply");
  });
});
