import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ messages: [] as any[], consents: [] as any[], tools: [] as any[] }));

vi.mock("@/server/sdr/tools", () => ({
  SDR_TOOLS: [],
  runTool: vi.fn(async (name: string, input: unknown) => {
    db.tools.push({ name, input });
    return { ok: true };
  }),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    sdrSettings: { findUnique: async () => ({ handoffUserId: "u1" }), findFirst: async () => null },
    contact: { findUnique: async () => ({ displayName: "John" }) },
    lead: { findUnique: async () => ({ id: "lead1" }), findFirst: async () => null, update: async () => ({}) },
    message: {
      findFirst: async ({ where }: any) => db.messages.find((m) => m.externalMessageId === where.externalMessageId) ?? null,
      create: async ({ data }: any) => db.messages.push(data),
    },
    conversation: { update: async () => ({}) },
    activity: { create: async () => ({}) },
    consent: { create: (a: any) => (db.consents.push(a.data), a) },
    $transaction: async (ops: unknown[]) => ops,
  },
}));

import { signContext } from "@/server/voice/config";
import { findRecordingUrl, handleVapiWebhook } from "@/server/voice/webhook";

const SECRET = "test-secret";
const ctx = { o: "org1", k: "contact1", c: "conv1", l: "lead1", p: "scheduled" as const };
const req = (body: unknown, opts: { ctx?: string; headers?: Record<string, string> } = {}) =>
  new Request(`https://crm.test/api/webhooks/vapi${opts.ctx ? `?ctx=${encodeURIComponent(opts.ctx)}` : ""}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(opts.headers ?? {}) },
    body: JSON.stringify(body),
  });

describe("handleVapiWebhook", () => {
  beforeEach(() => {
    process.env.VAPI_WEBHOOK_SECRET = SECRET;
    db.messages.length = 0;
    db.consents.length = 0;
    db.tools.length = 0;
  });

  it("recusa sem contexto assinado nem segredo", async () => {
    const r = await handleVapiWebhook(req({ message: { type: "tool-calls" } }));
    expect(r.status).toBe(401);
    const forged = await handleVapiWebhook(req({ message: { type: "tool-calls" } }, { ctx: signContext(ctx, "outro") }));
    expect(forged.status).toBe(401);
  });

  it("executa as ferramentas do CRM e devolve results por toolCallId", async () => {
    const r = await handleVapiWebhook(
      req(
        {
          message: {
            type: "tool-calls",
            toolCallList: [
              { id: "t1", function: { name: "update_lead", arguments: { country: "US" } } },
              { id: "t2", function: { name: "check_availability", arguments: '{"material":"Black Taurus"}' } },
            ],
          },
        },
        { ctx: signContext(ctx, SECRET) },
      ),
    );
    expect(r.status).toBe(200);
    expect((r.body as any).results.map((x: any) => x.toolCallId)).toEqual(["t1", "t2"]);
    expect(db.tools[1]).toEqual({ name: "check_availability", input: { material: "Black Taurus" } });
  });

  it("do_not_call registra recusa de ligações", async () => {
    await handleVapiWebhook(
      req({ message: { type: "tool-calls", toolCallList: [{ id: "t1", function: { name: "do_not_call", arguments: {} } }] } }, { ctx: signContext(ctx, SECRET) }),
    );
    expect(db.consents[0]).toMatchObject({ contactId: "contact1", purpose: "calls", granted: false });
  });

  it("fim da ligação grava resumo, transcrição e gravação uma vez só", async () => {
    const body = {
      message: {
        type: "end-of-call-report",
        endedReason: "customer-ended-call",
        analysis: { summary: "Importador em Miami quer 2 containers de Black Taurus." },
        artifact: { transcript: "AI: Hi\nUser: Hello", recording: { stereoUrl: "https://rec.test/a.wav" } },
        call: { id: "call_1", type: "outboundPhoneCall", startedAt: "2026-11-05T14:00:00Z", endedAt: "2026-11-05T14:03:00Z" },
      },
    };
    await handleVapiWebhook(req(body, { ctx: signContext(ctx, SECRET) }));
    await handleVapiWebhook(req(body, { ctx: signContext(ctx, SECRET) }));
    expect(db.messages).toHaveLength(1);
    expect(db.messages[0]).toMatchObject({ channel: "PHONE", direction: "OUTBOUND", sentByAi: true, mediaUrl: "https://rec.test/a.wav" });
    expect(db.messages[0].text).toContain("3 min");
    expect(db.messages[0].text).toContain("Black Taurus");
  });
});

describe("findRecordingUrl", () => {
  it("acha a URL em formatos diferentes", () => {
    expect(findRecordingUrl({ recordingUrl: "https://a" })).toBe("https://a");
    expect(findRecordingUrl({ recording: { mono: { combinedUrl: "https://b" } } })).toBe("https://b");
    expect(findRecordingUrl({})).toBeNull();
  });
});
