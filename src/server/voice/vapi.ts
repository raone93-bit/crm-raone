import type { Language, SdrSettings } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { SDR_TOOLS } from "@/server/sdr/tools";
import { appUrl, nextBusinessWindow, signContext, timezoneFor, toE164, vapiConfigured, type CallContext } from "./config";
import { buildVoiceSystemPrompt, firstMessage, type VoicePurpose } from "./prompt";

/**
 * Integração com a Vapi (voz com IA): monta o assistente de cada ligação
 * com o contexto do CRM, cria ligações (agora ou agendadas) e garante a
 * conversa de telefone onde a ligação fica registrada.
 */

const VAPI_API = "https://api.vapi.ai";

// Ferramentas do chat que fazem sentido ao telefone (sem send_reply/no_reply).
const CHAT_ONLY = new Set(["send_reply", "no_reply"]);

export const DO_NOT_CALL_TOOL = {
  name: "do_not_call",
  description: "O cliente pediu para não receber mais ligações. Registra e impede novas ligações automáticas.",
  input_schema: { type: "object", properties: { note: { type: "string" } } },
} as const;

function stripAdditional(schema: Record<string, unknown>): Record<string, unknown> {
  const { additionalProperties: _drop, ...rest } = schema;
  void _drop;
  return rest;
}

export function voiceTools() {
  const fns = [...SDR_TOOLS.filter((t) => !CHAT_ONLY.has(t.name)), DO_NOT_CALL_TOOL].map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: stripAdditional(t.input_schema as unknown as Record<string, unknown>),
    },
  }));
  return [...fns, { type: "endCall" as const }];
}

async function vapiFetch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${VAPI_API}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.VAPI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Vapi ${res.status}: ${text.slice(0, 300)}`);
  return (text ? JSON.parse(text) : {}) as T;
}

// ── Contato, telefone, conversa ─────────────────────────────────────────────

/** Telefone para ligar: o do cadastro ou o número do WhatsApp do contato. */
export async function phoneForContact(organizationId: string, contactId: string): Promise<string | null> {
  const contact = await prisma.contact.findFirst({ where: { id: contactId, organizationId }, include: { identities: true } });
  if (!contact) return null;
  const fromProfile = toE164(contact.phone);
  if (fromProfile) return fromProfile;
  const wa = contact.identities.find((i) => i.channel === "WHATSAPP");
  if (wa) return toE164(wa.externalId, { fromWhatsApp: true });
  const phone = contact.identities.find((i) => i.channel === "PHONE");
  return toE164(phone?.externalId);
}

/** A ligação fica numa conversa do canal Telefone, como as de chat. */
export async function ensurePhoneConversation(organizationId: string, contactId: string, phone: string) {
  const existing = await prisma.conversation.findFirst({
    where: { organizationId, channel: "PHONE", externalThreadId: phone },
  });
  if (existing) return existing;
  return prisma.conversation.create({
    data: { organizationId, contactId, channel: "PHONE", externalThreadId: phone, status: "OPEN", aiPaused: true },
  });
}

/** Último registro de consentimento do contato para um propósito. */
async function latestConsent(organizationId: string, contactId: string, purpose: string) {
  return prisma.consent.findFirst({ where: { organizationId, contactId, purpose }, orderBy: { createdAt: "desc" } });
}

/**
 * Pode ligar? Nunca para quem pediu para parar (mensagens ou ligações).
 * Agendada e reativação exigem que o cliente tenha aceitado receber ligação.
 */
export async function callAllowed(
  organizationId: string,
  contactId: string,
  purpose: VoicePurpose,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const [messaging, calls, contact] = await Promise.all([
    latestConsent(organizationId, contactId, "messaging"),
    latestConsent(organizationId, contactId, "calls"),
    prisma.contact.findFirst({ where: { id: contactId, organizationId }, select: { isBlocked: true } }),
  ]);
  if (!contact) return { ok: false, reason: "contato não encontrado" };
  if (contact.isBlocked) return { ok: false, reason: "contato bloqueado" };
  if (messaging && !messaging.granted) return { ok: false, reason: "cliente pediu para não ser contatado" };
  if (calls && !calls.granted) return { ok: false, reason: "cliente pediu para não receber ligações" };
  if ((purpose === "scheduled" || purpose === "reactivation") && !calls?.granted) {
    return { ok: false, reason: "cliente não aceitou receber ligação" };
  }
  return { ok: true };
}

// ── Voz ─────────────────────────────────────────────────────────────────────

/** Padrões por provedor quando a tela não informa modelo/voz (só valores documentados). */
const VOICE_DEFAULTS: Record<string, { model?: string; voiceId?: string }> = {
  "11labs": { model: "eleven_flash_v2_5", voiceId: "sarah" },
  openai: { voiceId: "alloy" },
  cartesia: {},
  vapi: {},
};

export function voiceConfig(s: Pick<SdrSettings, "voiceProvider" | "voiceModel" | "voiceId">) {
  const provider = s.voiceProvider || process.env.VAPI_VOICE_PROVIDER || "11labs";
  const d = VOICE_DEFAULTS[provider] ?? {};
  const voiceId = s.voiceId || process.env.VAPI_VOICE_ID || d.voiceId;
  // Provedor sem voz escolhida e sem padrão conhecido → volta para a ElevenLabs.
  if (!voiceId) return { provider: "11labs", model: "eleven_flash_v2_5", voiceId: "sarah" };
  const model = s.voiceModel || d.model;
  return { provider, voiceId, ...(model ? { model } : {}) };
}

// ── Assistente da ligação ───────────────────────────────────────────────────

export async function buildAssistant(params: {
  settings: SdrSettings;
  ctx: CallContext;
  purpose: VoicePurpose;
}) {
  const { settings, ctx, purpose } = params;
  const [contact, lead, chat] = await Promise.all([
    prisma.contact.findUnique({ where: { id: ctx.k } }),
    ctx.l
      ? prisma.lead.findUnique({ where: { id: ctx.l }, include: { stage: true, material: true } })
      : prisma.lead.findFirst({
          where: { organizationId: ctx.o, contactId: ctx.k, wonAt: null, lostAt: null },
          orderBy: { createdAt: "desc" },
          include: { stage: true, material: true },
        }),
    prisma.message.findMany({
      where: { organizationId: ctx.o, conversation: { contactId: ctx.k }, channel: { not: "PHONE" } },
      orderBy: { createdAt: "desc" },
      take: 12,
    }),
  ]);

  const language: Language | null = lead?.language && lead.language !== "OTHER" ? lead.language : contact?.primaryLanguage ?? null;
  const recentChat = chat.length
    ? chat
        .reverse()
        .filter((m) => m.text)
        .map((m) => `${m.direction === "INBOUND" ? "CLIENTE" : "NÓS"}: ${m.text}`)
        .join("\n")
    : null;

  const secret = process.env.VAPI_WEBHOOK_SECRET ?? "";
  const token = signContext({ ...ctx, l: ctx.l ?? lead?.id ?? null }, secret);

  return {
    name: `${settings.agentName} (voz)`.slice(0, 40),
    firstMessage: firstMessage(language, purpose, settings.agentName, settings.companyName, contact?.displayName ?? null),
    maxDurationSeconds: 600,
    model: {
      provider: "anthropic",
      model: process.env.VAPI_LLM_MODEL || "claude-haiku-5-5",
      temperature: 0.4,
      messages: [
        {
          role: "system",
          content: buildVoiceSystemPrompt({
            agentName: settings.agentName,
            companyName: settings.companyName,
            knowledgeBase: settings.knowledgeBase,
            qualificationCriteria: settings.qualificationCriteria,
            purpose,
            nowIso: new Date().toISOString(),
            contact: { name: contact?.displayName ?? null, country: contact?.country ?? null, language },
            lead: lead
              ? {
                  etapa: lead.stage.name,
                  temperatura: lead.temperature,
                  material: lead.material?.commercialName ?? lead.materialText,
                  espessuraCm: lead.thicknessCm,
                  m2: lead.squareMeters,
                  projeto: lead.hasProject,
                }
              : null,
            recentChat,
          }),
        },
      ],
      tools: voiceTools(),
    },
    voice: voiceConfig(settings),
    transcriber: {
      provider: "deepgram",
      model: process.env.VAPI_TRANSCRIBER_MODEL || "nova-3",
      language: "multi",
    },
    serverMessages: ["tool-calls", "end-of-call-report"],
    server: {
      url: `${appUrl()}/api/webhooks/vapi?ctx=${encodeURIComponent(token)}`,
      headers: { "x-crm-secret": secret },
    },
    metadata: { organizationId: ctx.o, contactId: ctx.k, leadId: ctx.l ?? lead?.id ?? null, purpose },
  };
}

// ── Criar ligação ───────────────────────────────────────────────────────────

export type StartCallResult = { ok: true; callId: string; scheduledFor: Date | null } | { ok: false; reason: string };

/**
 * Liga (ou agenda a ligação) para um contato. Todas as guardas aqui:
 * voz ligada, Vapi configurada, número, consentimento e teto diário.
 */
export async function startCall(params: {
  organizationId: string;
  contactId: string;
  leadId?: string | null;
  purpose: Exclude<VoicePurpose, "inbound">;
  phone?: string | null;
  earliestAt?: Date | null;
  latestAt?: Date | null;
}): Promise<StartCallResult> {
  const { organizationId, contactId, purpose } = params;
  if (!vapiConfigured()) return { ok: false, reason: "Vapi não configurada (VAPI_API_KEY / VAPI_WEBHOOK_SECRET)" };

  const settings = await prisma.sdrSettings.findUnique({ where: { organizationId } });
  if (!settings?.voiceEnabled) return { ok: false, reason: "agente de voz desligado" };
  if (!settings.vapiPhoneNumberId) return { ok: false, reason: "número da Vapi não cadastrado" };

  const allowed = await callAllowed(organizationId, contactId, purpose);
  if (!allowed.ok) return allowed;

  const phone = toE164(params.phone) ?? (await phoneForContact(organizationId, contactId));
  if (!phone) return { ok: false, reason: "contato sem telefone com DDI" };

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const callsToday = await prisma.activity.count({
    where: { organizationId, verb: "call_queued", createdAt: { gte: today } },
  });
  if (callsToday >= settings.maxCallsPerDay) return { ok: false, reason: `limite de ${settings.maxCallsPerDay} ligações por dia` };

  const contact = await prisma.contact.findUnique({ where: { id: contactId } });
  const conversation = await ensurePhoneConversation(organizationId, contactId, phone);
  const ctx: CallContext = { o: organizationId, k: contactId, c: conversation.id, l: params.leadId ?? null, p: purpose };
  const assistant = await buildAssistant({ settings, ctx, purpose });

  // Ligação agendada: respeita o horário pedido; senão, horário comercial do cliente.
  let earliestAt = params.earliestAt ?? null;
  let latestAt = params.latestAt ?? null;
  if (!earliestAt) {
    const w = nextBusinessWindow(new Date(), timezoneFor(contact?.country, phone));
    earliestAt = w.earliestAt;
    latestAt = w.latestAt;
  }
  const future = earliestAt.getTime() > Date.now() + 60_000;

  const call = await vapiFetch<{ id: string }>("/call", {
    name: `${purpose} · ${contact?.displayName ?? phone}`.slice(0, 40),
    phoneNumberId: settings.vapiPhoneNumberId,
    customer: { number: phone, name: contact?.displayName?.slice(0, 40) },
    assistant,
    ...(future
      ? { schedulePlan: { earliestAt: earliestAt.toISOString(), ...(latestAt ? { latestAt: latestAt.toISOString() } : {}) } }
      : {}),
  });

  await prisma.activity.create({
    data: {
      organizationId,
      actorType: "AI",
      verb: "call_queued",
      subjectType: params.leadId ? "lead" : "contact",
      subjectId: params.leadId ?? contactId,
      summary: `Ligação ${future ? `agendada para ${earliestAt.toISOString()}` : "iniciada"} (${purpose}) para ${phone}`,
      meta: { vapiCallId: call.id, purpose, phone },
    },
  });

  return { ok: true, callId: call.id, scheduledFor: future ? earliestAt : null };
}
