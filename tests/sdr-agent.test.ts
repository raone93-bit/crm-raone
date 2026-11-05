import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Fluxo completo do agente com banco e Claude falsos: garante que ele usa as
 * ferramentas, envia pela fila e que o guardrail troca uma resposta com preço.
 */

const db = vi.hoisted(() => ({
  created: [] as any[],
  tasks: [] as any[],
  convUpdates: [] as any[],
}));
const script = vi.hoisted(() => ({ responses: [] as any[] }));

vi.mock("@/server/channels/outbound", () => ({ flushOutbound: vi.fn(async () => ({ sent: 1, failed: 0, pending: 0 })) }));
vi.mock("@/server/catalog/availability", () => ({
  checkAvailability: vi.fn(async () => ({
    found: true,
    material: "Black Taurus",
    bundles: [{ bundleNumber: "BT1", thicknessCm: 2, finish: "POLISHED", squareMeters: 60, slabCount: 10, location: "pátio", status: "AVAILABLE" }],
    totalSquareMeters: 60,
    note: "1 bundle(s), ~60 m² disponíveis.",
  })),
}));
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: vi.fn(async () => script.responses.shift()) };
  },
}));
vi.mock("@/lib/prisma", () => {
  const trigger = { id: "m1", text: "Do you have Black Taurus 2cm?", createdAt: new Date(), externalTimestamp: new Date(), aiAnalysis: { language: "EN" } };
  return {
    prisma: {
      sdrSettings: {
        findUnique: async () => ({
          enabled: true, channels: ["WHATSAPP"], maxRepliesPerDay: 15, agentName: "Ana", companyName: "Toledo",
          knowledgeBase: "", qualificationCriteria: "", handoffUserId: "u1", model: null,
        }),
      },
      conversation: {
        findFirst: async () => ({ id: "c1", channel: "WHATSAPP", status: "OPEN", aiPaused: false, contactId: "k1",
          contact: { displayName: "John", country: "US", primaryLanguage: "EN", isBlocked: false } }),
        update: async (a: any) => db.convUpdates.push(a),
      },
      message: {
        findFirst: async () => trigger,
        count: async () => 0,
        findMany: async () => [{ direction: "INBOUND", text: trigger.text, type: "TEXT" }],
        create: async (a: any) => { db.created.push(a.data); return { id: "out1" }; },
      },
      lead: { findFirst: async () => null, update: async () => ({}) },
      task: { create: async (a: any) => { db.tasks.push(a.data); return { id: "t1" }; } },
      activity: { create: async () => ({}) },
      note: { create: async () => ({}) },
      contact: { update: async () => ({}) },
      material: { findFirst: async () => null, findMany: async () => [] },
    },
  };
});

import { runSdrForInbound } from "@/server/sdr/agent";

const tool = (id: string, name: string, input: unknown) => ({ type: "tool_use", id, name, input });

describe("runSdrForInbound", () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "test";
    db.created.length = 0;
    db.tasks.length = 0;
    db.convUpdates.length = 0;
  });

  it("consulta estoque e responde pela fila, marcado como IA", async () => {
    script.responses = [
      { content: [tool("a", "check_availability", { material: "Black Taurus", thickness_cm: 2 })] },
      { content: [tool("b", "send_reply", { text: "Yes! We have about 60 m² of Black Taurus 2 cm in stock. What's your destination port?" })] },
    ];
    const r = await runSdrForInbound({ organizationId: "o1", conversationId: "c1", messageId: "m1" });
    expect(r.status).toBe("replied");
    expect(db.created[0]).toMatchObject({ direction: "OUTBOUND", sentByAi: true, status: "QUEUED", channel: "WHATSAPP" });
    expect(db.created[0].text).toContain("60 m²");
  });

  it("resposta com preço é bloqueada: vai mensagem de espera e tarefa urgente", async () => {
    script.responses = [{ content: [tool("a", "send_reply", { text: "It costs USD 85 per m2 FOB." })] }];
    const r = await runSdrForInbound({ organizationId: "o1", conversationId: "c1", messageId: "m1" });
    expect(r).toMatchObject({ status: "replied", blockedReason: "citou preço" });
    expect(db.created[0].text).not.toMatch(/85/);
    expect(db.tasks[0]).toMatchObject({ assigneeUserId: "u1" });
    expect(db.tasks[0].title).toContain("URGENTE");
    expect(db.convUpdates.some((u) => u.data?.aiPaused === true)).toBe(true);
  });

  it("no_reply não envia nada", async () => {
    script.responses = [{ content: [tool("a", "no_reply", { reason: "só agradeceu" })] }];
    const r = await runSdrForInbound({ organizationId: "o1", conversationId: "c1", messageId: "m1" });
    expect(r.status).toBe("no_reply");
    expect(db.created).toHaveLength(0);
  });
});
