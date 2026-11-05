import Anthropic from "@anthropic-ai/sdk";
import type { Language } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { flushOutbound } from "@/server/channels/outbound";
import { CHANNEL_LABEL } from "@/lib/labels";
import { asksForHuman, checkReply, decideAutoReply, detectOptOut } from "./guards";
import { buildSdrSystemPrompt } from "./prompt";
import { SDR_TOOLS, runTool, type ToolContext } from "./tools";
import { toClaudeMessages } from "./history";

/**
 * AGENTE SDR — piloto automático de atendimento.
 *
 * Roda depois que uma mensagem do cliente entra (ingestInboundMessage). Se as
 * guardas permitirem, conversa com o Claude usando ferramentas reais do CRM
 * (catálogo, estoque, lead, agendar ligação, passar para humano) e envia a
 * resposta pelo mesmo canal. Toda resposta passa pelo guardrail checkReply:
 * preço, prazo e condição de pagamento nunca saem sem um vendedor.
 */

const MAX_STEPS = 6;
const HISTORY = 20;

export type SdrRunResult =
  | { status: "skipped"; reason: string }
  | { status: "opted_out" }
  | { status: "no_reply"; reason: string; actions: string[] }
  | { status: "replied"; messageId: string; actions: string[]; blockedReason?: string }
  | { status: "error"; error: string };

const HOLDING: Record<Language, string> = {
  PT: "Obrigado pelas informações! Um especialista da nossa equipe vai continuar o seu atendimento em instantes.",
  EN: "Thank you for the details! One of our specialists will continue assisting you shortly.",
  ES: "¡Gracias por la información! Uno de nuestros especialistas continuará la atención en breve.",
  OTHER: "Thank you! One of our specialists will continue assisting you shortly.",
};

let client: Anthropic | null = null;
function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

export async function runSdrForInbound(params: {
  organizationId: string;
  conversationId: string;
  messageId: string;
}): Promise<SdrRunResult> {
  try {
    return await run(params);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    // eslint-disable-next-line no-console
    console.error("[sdr] falhou:", error);
    await prisma.activity
      .create({
        data: {
          organizationId: params.organizationId,
          actorType: "AI",
          verb: "ai_error",
          subjectType: "conversation",
          subjectId: params.conversationId,
          summary: `Agente SDR falhou: ${error.slice(0, 180)}`,
        },
      })
      .catch(() => undefined);
    return { status: "error", error };
  }
}

async function run({
  organizationId,
  conversationId,
  messageId,
}: {
  organizationId: string;
  conversationId: string;
  messageId: string;
}): Promise<SdrRunResult> {
  const [settings, conversation, trigger] = await Promise.all([
    prisma.sdrSettings.findUnique({ where: { organizationId } }),
    prisma.conversation.findFirst({ where: { id: conversationId, organizationId }, include: { contact: true } }),
    prisma.message.findFirst({ where: { id: messageId, organizationId }, include: { aiAnalysis: true } }),
  ]);
  if (!conversation || !trigger) return { status: "skipped", reason: "conversa ou mensagem não encontrada" };

  // ── Opt-out: o cliente pediu para parar. Pausa e registra (LGPD). ────────
  if (settings?.enabled && trigger.text && detectOptOut(trigger.text)) {
    await prisma.$transaction([
      prisma.conversation.update({
        where: { id: conversationId },
        data: { aiPaused: true, aiPausedReason: "Cliente pediu para parar de receber mensagens" },
      }),
      prisma.consent.create({
        data: { organizationId, contactId: conversation.contactId, purpose: "messaging", granted: false, source: conversation.channel },
      }),
      prisma.activity.create({
        data: {
          organizationId,
          actorType: "AI",
          verb: "opted_out",
          subjectType: "contact",
          subjectId: conversation.contactId,
          summary: "Cliente pediu para não receber mais mensagens — agente pausado",
        },
      }),
    ]);
    return { status: "opted_out" };
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [latestInbound, answeredAfter, aiReplies] = await Promise.all([
    prisma.message.findFirst({ where: { conversationId, direction: "INBOUND" }, orderBy: { createdAt: "desc" } }),
    prisma.message.count({ where: { conversationId, direction: "OUTBOUND", createdAt: { gt: trigger.createdAt } } }),
    prisma.message.count({ where: { conversationId, direction: "OUTBOUND", sentByAi: true, createdAt: { gte: since } } }),
  ]);

  const decision = decideAutoReply({
    settings,
    aiConfigured: !!getClient(),
    channel: conversation.channel,
    conversation,
    contactBlocked: conversation.contact.isBlocked,
    isLatestInbound: latestInbound?.id === trigger.id,
    alreadyAnswered: answeredAfter > 0,
    lastInboundAt: trigger.externalTimestamp ?? trigger.createdAt,
    aiRepliesLast24h: aiReplies,
  });
  if (!decision.ok || !settings) return { status: "skipped", reason: decision.ok ? "sem configuração" : decision.reason };

  // ── Contexto ─────────────────────────────────────────────────────────────
  const lead = await prisma.lead.findFirst({
    where: { organizationId, contactId: conversation.contactId, wonAt: null, lostAt: null },
    orderBy: { createdAt: "desc" },
    include: { stage: true, material: true },
  });
  const history = (
    await prisma.message.findMany({ where: { conversationId }, orderBy: { createdAt: "desc" }, take: HISTORY })
  ).reverse();

  const language: Language = trigger.aiAnalysis?.language ?? lead?.language ?? conversation.contact.primaryLanguage ?? "OTHER";

  const ctx: ToolContext = {
    organizationId,
    conversationId,
    contactId: conversation.contactId,
    contactName: conversation.contact.displayName,
    leadId: lead?.id ?? null,
    handoffUserId: settings.handoffUserId,
    state: { availabilityChecked: false, handedOff: false, actions: [] },
  };

  const system = buildSdrSystemPrompt({
    agentName: settings.agentName,
    companyName: settings.companyName,
    knowledgeBase: settings.knowledgeBase,
    qualificationCriteria: settings.qualificationCriteria,
    channel: CHANNEL_LABEL[conversation.channel] ?? conversation.channel,
    nowIso: new Date().toISOString(),
    contact: {
      name: conversation.contact.displayName,
      country: conversation.contact.country,
      language,
    },
    lead: lead
      ? {
          etapa: lead.stage.name,
          temperatura: lead.temperature,
          score: lead.score,
          material: lead.material?.commercialName ?? lead.materialText,
          espessuraCm: lead.thicknessCm,
          acabamento: lead.finish,
          m2: lead.squareMeters,
          chapas: lead.quantitySlabs,
          projeto: lead.hasProject,
        }
      : null,
  });

  const messages = toClaudeMessages(history);
  if (messages.length === 0 || messages[messages.length - 1].role !== "user") {
    return { status: "skipped", reason: "nada novo do cliente para responder" };
  }

  // ── Loop do agente ───────────────────────────────────────────────────────
  const anthropic = getClient()!;
  const model = settings.model || process.env.SDR_MODEL || "claude-sonnet-4-5";
  let finalText: string | null = null;
  let noReplyReason: string | null = null;

  for (let step = 0; step < MAX_STEPS && finalText === null && noReplyReason === null; step++) {
    const res = await anthropic.messages.create({
      model,
      max_tokens: 1024,
      system,
      tools: SDR_TOOLS as any,
      tool_choice: { type: "any" },
      messages,
    });

    messages.push({ role: "assistant", content: res.content });
    const toolUses = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (toolUses.length === 0) {
      const text = res.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text?.trim();
      if (text) finalText = text;
      break;
    }

    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const tu of toolUses) {
      const input = tu.input as any;
      if (tu.name === "send_reply") {
        finalText = String(input?.text ?? "").trim();
        results.push({ type: "tool_result", tool_use_id: tu.id, content: "ok" });
        continue;
      }
      if (tu.name === "no_reply") {
        noReplyReason = String(input?.reason ?? "sem motivo");
        results.push({ type: "tool_result", tool_use_id: tu.id, content: "ok" });
        continue;
      }
      try {
        const out = await runTool(tu.name, input, ctx);
        results.push({ type: "tool_result", tool_use_id: tu.id, content: JSON.stringify(out) });
      } catch (err) {
        // Falha de uma ferramenta não derruba a conversa: o agente fica sabendo e segue.
        results.push({
          type: "tool_result",
          tool_use_id: tu.id,
          is_error: true,
          content: err instanceof Error ? err.message : String(err),
        });
      }
    }
    if (finalText === null && noReplyReason === null) messages.push({ role: "user", content: results });
  }

  // Cliente pediu uma pessoa e o agente não passou adiante: passa agora.
  if (trigger.text && asksForHuman(trigger.text) && !ctx.state.handedOff) {
    await runTool(
      "handoff_to_human",
      { reason: "asked_for_human", summary: `Cliente pediu para falar com uma pessoa. Última mensagem: "${trigger.text.slice(0, 200)}"` },
      ctx,
    );
  }

  if (finalText === null) {
    await logRun(ctx, `Agente SDR não respondeu (${noReplyReason ?? "sem resposta final"})`);
    return { status: "no_reply", reason: noReplyReason ?? "sem resposta final", actions: ctx.state.actions };
  }

  // ── Guardrail final ──────────────────────────────────────────────────────
  let blockedReason: string | undefined;
  const check = checkReply(finalText, { availabilityChecked: ctx.state.availabilityChecked });
  if (!check.ok) {
    blockedReason = check.reason;
    if (!ctx.state.handedOff) {
      await runTool(
        "handoff_to_human",
        {
          reason: "price_or_quote",
          urgent: true,
          summary: `Resposta da IA bloqueada (${check.reason}). Texto que NÃO foi enviado: "${finalText.slice(0, 400)}"`,
        },
        ctx,
      );
    }
    finalText = HOLDING[language];
  }

  const sent = await prisma.message.create({
    data: {
      organizationId,
      conversationId,
      direction: "OUTBOUND",
      channel: conversation.channel,
      type: "TEXT",
      text: finalText,
      senderName: `${settings.agentName} (IA)`,
      sentByAi: true,
      status: "QUEUED",
    },
  });
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { lastMessageAt: new Date(), lastMessagePreview: finalText.slice(0, 140) },
  });
  await logRun(
    ctx,
    `Agente SDR respondeu${blockedReason ? ` (texto original bloqueado: ${blockedReason})` : ""}${
      ctx.state.actions.length ? ` · ${ctx.state.actions.join(", ")}` : ""
    }`,
  );
  await flushOutbound(3);

  return { status: "replied", messageId: sent.id, actions: ctx.state.actions, blockedReason };
}

async function logRun(ctx: ToolContext, summary: string) {
  await prisma.activity.create({
    data: {
      organizationId: ctx.organizationId,
      actorType: "AI",
      verb: "ai_replied",
      subjectType: ctx.leadId ? "lead" : "contact",
      subjectId: ctx.leadId ?? ctx.contactId,
      summary: summary.slice(0, 500),
    },
  });
}
