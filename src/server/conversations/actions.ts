"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/rbac";
import { conversationVisibilityWhere } from "@/lib/tenant";
import { record } from "@/lib/audit";
import { ingestInboundMessage } from "@/server/conversations/ingest";
import { sendConfigFor } from "@/server/channels/registry";
import { flushOutbound } from "@/server/channels/outbound";
import type { SimulateState } from "@/server/conversations/sim-data";

const idSchema = z.object({ conversationId: z.string() });

export type ReplyState = { error?: string; ok?: boolean };

/**
 * Resposta escrita no CRM. A mensagem entra como QUEUED; se o canal estiver
 * conectado (Fase 3), `flushOutbound` faz o envio real na hora e atualiza o
 * status para SENT (ou FAILED com o erro real). Sem canal, fica na fila.
 * NÃO simula envio.
 */
export async function sendReply(_prev: ReplyState, formData: FormData): Promise<ReplyState> {
  const user = await requireUser();
  if (!can(user.role, "edit", "conversation")) return { error: "Sem permissão." };

  const parsed = z
    .object({ conversationId: z.string(), text: z.string().min(1, "Escreva a mensagem.") })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  const conv = await prisma.conversation.findFirst({
    where: { id: parsed.data.conversationId, ...conversationVisibilityWhere(user) },
  });
  if (!conv) return { error: "Conversa não encontrada." };

  const config = await sendConfigFor(user.organizationId, conv.channel);
  const channelReady = !!config;

  await prisma.message.create({
    data: {
      organizationId: user.organizationId,
      conversationId: conv.id,
      direction: "OUTBOUND",
      channel: conv.channel,
      type: "TEXT",
      text: parsed.data.text,
      senderName: user.name ?? user.email,
      sentByUserId: user.id,
      status: "QUEUED",
      errorMessage: channelReady ? null : "Canal não conectado — a mensagem fica na fila.",
    },
  });

  await prisma.conversation.update({
    where: { id: conv.id },
    data: { lastMessageAt: new Date(), lastMessagePreview: parsed.data.text.slice(0, 140), status: "OPEN" },
  });

  let deliveryNote = "na fila — canal pendente";
  if (channelReady) {
    const flushed = await flushOutbound(3);
    deliveryNote = flushed.sent > 0 ? "enviada" : flushed.failed > 0 ? "falhou no envio" : "na fila";
  }

  await record(user, {
    action: "reply",
    entity: "conversation",
    entityId: conv.id,
    verb: "replied",
    subjectType: "contact",
    subjectId: conv.contactId,
    summary: `Resposta pelo CRM (${deliveryNote})`,
  });

  revalidatePath("/conversas");
  return { ok: true };
}

export async function markConversationRead(formData: FormData) {
  const user = await requireUser();
  const { conversationId } = idSchema.parse(Object.fromEntries(formData));
  await prisma.conversation.updateMany({
    where: { id: conversationId, ...conversationVisibilityWhere(user) },
    data: { unreadCount: 0 },
  });
  revalidatePath("/conversas");
  revalidatePath("/dashboard");
}

export async function setConversationStatus(formData: FormData) {
  const user = await requireUser();
  const parsed = z
    .object({
      conversationId: z.string(),
      status: z.enum(["OPEN", "PENDING", "SNOOZED", "CLOSED"]),
    })
    .parse(Object.fromEntries(formData));

  await prisma.conversation.updateMany({
    where: { id: parsed.conversationId, ...conversationVisibilityWhere(user) },
    data: { status: parsed.status },
  });
  revalidatePath("/conversas");
}

export async function assignConversation(formData: FormData) {
  const user = await requireUser();
  if (!can(user.role, "assign", "conversation")) throw new Error("Sem permissão.");
  const parsed = z
    .object({ conversationId: z.string(), sellerId: z.string() })
    .parse(Object.fromEntries(formData));

  const seller = await prisma.seller.findFirst({
    where: { id: parsed.sellerId, organizationId: user.organizationId },
  });
  if (!seller) throw new Error("Vendedor inválido.");

  await prisma.conversation.updateMany({
    where: { id: parsed.conversationId, organizationId: user.organizationId },
    data: { assignedSellerId: seller.id, assignedUserId: seller.userId },
  });
  revalidatePath("/conversas");
}

// ── Simulador de entrada (item 59: "inbound simulado") ─────────────────────
export async function simulateInbound(
  _prev: SimulateState,
  formData: FormData,
): Promise<SimulateState> {
  const user = await requireUser();
  if (user.role !== "ADMIN") return { error: "Apenas o admin pode usar o simulador." };

  const parsed = z
    .object({
      channel: z.enum(["WHATSAPP", "INSTAGRAM", "FACEBOOK"]),
      contactName: z.string().min(1),
      externalContactId: z.string().min(1),
      text: z.string().min(1),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Preencha canal, nome, ID e mensagem." };

  const r = await ingestInboundMessage({
    organizationId: user.organizationId,
    channel: parsed.data.channel,
    externalContactId: parsed.data.externalContactId,
    contactName: parsed.data.contactName,
    contactHandle: parsed.data.contactName.toLowerCase().replace(/\s+/g, ""),
    text: parsed.data.text,
    externalMessageId: `sim_${Date.now()}`,
    source: "simulator",
  });

  revalidatePath("/conversas");
  revalidatePath("/leads");
  revalidatePath("/dashboard");

  return {
    result: r.hadCommercialIntent
      ? `Intenção comercial detectada (${r.language}). ${
          r.leadCreated ? "Lead criado" : "Lead existente atualizado"
        } · conversa ${r.duplicateMessage ? "(mensagem duplicada ignorada)" : "atualizada"}.`
      : `Sem intenção comercial (${r.language}). Nenhum lead criado — só a conversa foi registrada.`,
  };
}
