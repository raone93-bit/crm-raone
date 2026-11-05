import type { SdrSettings } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { runTool, type ToolContext } from "@/server/sdr/tools";
import { headerSecretOk, toE164, verifyContext, type CallContext } from "./config";
import { buildAssistant, ensurePhoneConversation } from "./vapi";

/**
 * Webhook da Vapi. Três mensagens importam:
 *  - assistant-request  → ligação RECEBIDA: devolve o assistente com o contexto do CRM
 *  - tool-calls         → o assistente quer usar uma ferramenta do CRM
 *  - end-of-call-report → fim da ligação: grava resumo, transcrição e gravação
 * Autenticação: contexto assinado na URL (ligações que nós montamos) ou o
 * segredo no header (ligações recebidas, configuradas no painel da Vapi).
 */

type VapiMessage = { type: string; call?: any; toolCallList?: any[]; artifact?: any; analysis?: any; endedReason?: string };

export async function handleVapiWebhook(req: Request): Promise<{ status: number; body: unknown }> {
  const secret = process.env.VAPI_WEBHOOK_SECRET ?? "";
  if (!secret) return { status: 503, body: { error: "VAPI_WEBHOOK_SECRET não configurado" } };

  const url = new URL(req.url);
  const ctx = verifyContext(url.searchParams.get("ctx"), secret);
  if (!ctx && !headerSecretOk(req.headers, secret)) return { status: 401, body: { error: "unauthorized" } };

  let payload: { message?: VapiMessage };
  try {
    payload = await req.json();
  } catch {
    return { status: 400, body: { error: "json inválido" } };
  }
  const msg = payload.message;
  if (!msg?.type) return { status: 200, body: {} };

  switch (msg.type) {
    case "assistant-request":
      return { status: 200, body: await onAssistantRequest(msg) };
    case "tool-calls":
      if (!ctx) return { status: 200, body: { results: [] } };
      return { status: 200, body: await onToolCalls(msg, ctx) };
    case "end-of-call-report":
      if (ctx) await onEndOfCall(msg, ctx);
      return { status: 200, body: {} };
    default:
      return { status: 200, body: {} };
  }
}

// ── Ligação recebida ────────────────────────────────────────────────────────

async function onAssistantRequest(msg: VapiMessage) {
  const phoneNumberId: string | undefined = msg.call?.phoneNumberId;
  const settings: SdrSettings | null =
    (phoneNumberId ? await prisma.sdrSettings.findFirst({ where: { vapiPhoneNumberId: phoneNumberId } }) : null) ??
    (await prisma.sdrSettings.findFirst({ where: { voiceEnabled: true } }));
  if (!settings?.voiceEnabled) {
    return { error: "No momento não conseguimos atender. Por favor, envie uma mensagem no WhatsApp." };
  }

  const orgId = settings.organizationId;
  const caller = toE164(msg.call?.customer?.number) ?? String(msg.call?.customer?.number ?? "desconhecido");

  // Acha o contato pelo telefone (cadastro ou WhatsApp) ou cria um novo.
  const digits = caller.replace(/\D/g, "");
  let contact =
    (await prisma.contact.findFirst({ where: { organizationId: orgId, phone: { in: [caller, digits] } } })) ??
    (
      await prisma.contactIdentity.findFirst({
        where: { organizationId: orgId, channel: { in: ["WHATSAPP", "PHONE"] }, externalId: { in: [caller, digits] } },
        include: { contact: true },
      })
    )?.contact ??
    null;
  if (!contact) {
    contact = await prisma.contact.create({
      data: {
        organizationId: orgId,
        displayName: `Ligação ${caller}`,
        phone: caller.startsWith("+") ? caller : undefined,
        identities: { create: { organizationId: orgId, channel: "PHONE", externalId: caller } },
      },
    });
  }

  const conversation = await ensurePhoneConversation(orgId, contact.id, caller);
  const ctx: CallContext = { o: orgId, k: contact.id, c: conversation.id, l: null, p: "inbound" };
  return { assistant: await buildAssistant({ settings, ctx, purpose: "inbound" }) };
}

// ── Ferramentas durante a ligação ───────────────────────────────────────────

async function onToolCalls(msg: VapiMessage, ctx: CallContext) {
  const settings = await prisma.sdrSettings.findUnique({ where: { organizationId: ctx.o } });
  const contact = await prisma.contact.findUnique({ where: { id: ctx.k } });
  const lead =
    (ctx.l ? await prisma.lead.findUnique({ where: { id: ctx.l } }) : null) ??
    (await prisma.lead.findFirst({
      where: { organizationId: ctx.o, contactId: ctx.k, wonAt: null, lostAt: null },
      orderBy: { createdAt: "desc" },
    }));

  const toolCtx: ToolContext = {
    organizationId: ctx.o,
    conversationId: ctx.c,
    contactId: ctx.k,
    contactName: contact?.displayName ?? "cliente",
    leadId: lead?.id ?? null,
    handoffUserId: settings?.handoffUserId ?? null,
    state: { availabilityChecked: false, handedOff: false, actions: [] },
  };

  const results = [];
  for (const call of msg.toolCallList ?? []) {
    const name: string = call?.function?.name ?? call?.name;
    let args = call?.function?.arguments ?? call?.arguments ?? {};
    if (typeof args === "string") {
      try {
        args = JSON.parse(args);
      } catch {
        args = {};
      }
    }
    try {
      const out =
        name === "do_not_call"
          ? await doNotCall(ctx, String(args?.note ?? ""))
          : await runTool(name, args, toolCtx);
      results.push({ name, toolCallId: call.id, result: JSON.stringify(out) });
    } catch (err) {
      results.push({ name, toolCallId: call.id, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return { results };
}

async function doNotCall(ctx: CallContext, note: string) {
  await prisma.$transaction([
    prisma.consent.create({
      data: { organizationId: ctx.o, contactId: ctx.k, purpose: "calls", granted: false, source: "PHONE" },
    }),
    prisma.activity.create({
      data: {
        organizationId: ctx.o,
        actorType: "AI",
        verb: "opted_out",
        subjectType: "contact",
        subjectId: ctx.k,
        summary: `Cliente pediu para não receber ligações${note ? ` — ${note.slice(0, 120)}` : ""}`,
      },
    }),
  ]);
  return { saved: true };
}

// ── Fim da ligação ──────────────────────────────────────────────────────────

/** Primeira URL de gravação que aparecer no artifact (o formato varia por versão). */
export function findRecordingUrl(artifact: any): string | null {
  if (!artifact) return null;
  if (typeof artifact.recordingUrl === "string") return artifact.recordingUrl;
  const rec = artifact.recording;
  if (typeof rec === "string") return rec;
  const stack = rec && typeof rec === "object" ? [rec] : [];
  while (stack.length) {
    const cur = stack.pop();
    for (const v of Object.values(cur ?? {})) {
      if (typeof v === "string" && /^https?:\/\//.test(v)) return v;
      if (v && typeof v === "object") stack.push(v);
    }
  }
  return null;
}

async function onEndOfCall(msg: VapiMessage, ctx: CallContext) {
  const call = msg.call ?? {};
  const callId: string | undefined = call.id;

  // Idempotência: a Vapi pode reenviar o relatório.
  if (callId) {
    const dup = await prisma.message.findFirst({
      where: { organizationId: ctx.o, channel: "PHONE", externalMessageId: callId },
    });
    if (dup) return;
  }

  const summary: string | null = msg.analysis?.summary ?? call.analysis?.summary ?? null;
  const transcript: string | null = msg.artifact?.transcript ?? call.artifact?.transcript ?? null;
  const recordingUrl = findRecordingUrl(msg.artifact) ?? findRecordingUrl(call.artifact);
  const inbound = call.type === "inboundPhoneCall" || ctx.p === "inbound";
  const started = call.startedAt ? new Date(call.startedAt) : null;
  const ended = call.endedAt ? new Date(call.endedAt) : null;
  const minutes = started && ended ? Math.max(0, Math.round((ended.getTime() - started.getTime()) / 6000) / 10) : null;
  const cost = typeof call.cost === "number" ? call.cost : null;

  const header = `📞 Ligação ${inbound ? "recebida" : "feita pela IA"}${minutes != null ? ` · ${minutes} min` : ""}${
    msg.endedReason ? ` · ${msg.endedReason}` : ""
  }`;
  const text = [header, summary && `Resumo: ${summary}`, transcript && `Transcrição:\n${transcript.slice(0, 8000)}`]
    .filter(Boolean)
    .join("\n\n");

  await prisma.message.create({
    data: {
      organizationId: ctx.o,
      conversationId: ctx.c,
      direction: inbound ? "INBOUND" : "OUTBOUND",
      channel: "PHONE",
      type: "AUDIO",
      text,
      mediaUrl: recordingUrl ?? undefined,
      mediaMimeType: recordingUrl ? "audio/wav" : undefined,
      senderName: inbound ? undefined : "Agente de voz (IA)",
      sentByAi: !inbound,
      status: inbound ? "RECEIVED" : "SENT",
      externalMessageId: callId,
      externalTimestamp: ended ?? new Date(),
      raw: { endedReason: msg.endedReason ?? null, cost, purpose: ctx.p },
    },
  });
  await prisma.conversation.update({
    where: { id: ctx.c },
    data: {
      lastMessageAt: new Date(),
      lastMessagePreview: (summary ?? header).slice(0, 140),
      unreadCount: { increment: 1 },
      status: "OPEN",
    },
  });

  const leadId = ctx.l ?? null;
  if (leadId) await prisma.lead.update({ where: { id: leadId }, data: { lastContactAt: new Date() } }).catch(() => undefined);
  await prisma.activity.create({
    data: {
      organizationId: ctx.o,
      actorType: "AI",
      verb: "call_ended",
      subjectType: leadId ? "lead" : "contact",
      subjectId: leadId ?? ctx.k,
      summary: `${header}${summary ? ` — ${summary.slice(0, 300)}` : ""}`,
      meta: { vapiCallId: callId ?? null, cost, recordingUrl, purpose: ctx.p },
    },
  });
}

