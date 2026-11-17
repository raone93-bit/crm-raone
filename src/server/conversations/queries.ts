import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import type { CurrentUser } from "@/lib/session";
import { conversationVisibilityWhere } from "@/lib/tenant";

export type ConversationFilter = {
  status?: string;
  channel?: string;
  mine?: boolean;
  unread?: boolean;
};

export async function listConversations(user: CurrentUser, filter: ConversationFilter) {
  const and: Prisma.ConversationWhereInput[] = [conversationVisibilityWhere(user)];

  if (filter.status && ["OPEN", "PENDING", "SNOOZED", "CLOSED"].includes(filter.status)) {
    and.push({ status: filter.status as "OPEN" | "PENDING" | "SNOOZED" | "CLOSED" });
  }
  if (filter.channel && ["WHATSAPP", "INSTAGRAM", "FACEBOOK"].includes(filter.channel)) {
    and.push({ channel: filter.channel as "WHATSAPP" | "INSTAGRAM" | "FACEBOOK" });
  }
  if (filter.unread) and.push({ unreadCount: { gt: 0 } });
  if (filter.mine && user.sellerId) and.push({ assignedSellerId: user.sellerId });

  return prisma.conversation.findMany({
    where: { AND: and },
    select: {
      id: true,
      channel: true,
      lastMessagePreview: true,
      lastMessageAt: true,
      unreadCount: true,
      status: true,
      contact: { select: { displayName: true } },
      seller: { select: { displayName: true } },
    },
    orderBy: { lastMessageAt: "desc" },
    take: 60,
  });
}

export async function getConversation(user: CurrentUser, id: string) {
  const conversation = await prisma.conversation.findFirst({
    where: { id, ...conversationVisibilityWhere(user) },
    select: {
      id: true,
      channel: true,
      status: true,
      unreadCount: true,
      contactId: true,
      assignedSellerId: true,
      aiPaused: true,
      aiPausedReason: true,
      contact: {
        select: {
          displayName: true,
          leads: {
            where: { wonAt: null, lostAt: null },
            orderBy: { updatedAt: "desc" },
            take: 1,
            select: {
              id: true,
              temperature: true,
              score: true,
              materialText: true,
              thicknessCm: true,
              squareMeters: true,
              quantitySlabs: true,
              language: true,
              intentType: true,
              hasProject: true,
              stage: { select: { name: true } },
              seller: { select: { displayName: true } },
              material: { select: { commercialName: true } },
            },
          },
        },
      },
      seller: { select: { displayName: true } },
      // só as 150 mensagens mais recentes (devolvidas em ordem cronológica)
      messages: {
        orderBy: { createdAt: "desc" },
        take: 150,
        select: {
          id: true,
          direction: true,
          channel: true,
          mediaUrl: true,
          sentByAi: true,
          type: true,
          mediaFileName: true,
          text: true,
          externalTimestamp: true,
          createdAt: true,
          status: true,
          errorMessage: true,
          aiAnalysis: { select: { suggestedReply: true, summary: true } },
        },
      },
    },
  });
  if (conversation) conversation.messages.reverse();
  return conversation;
}

export async function unreadTotal(user: CurrentUser) {
  const rows = await prisma.conversation.aggregate({
    where: { ...conversationVisibilityWhere(user), unreadCount: { gt: 0 } },
    _sum: { unreadCount: true },
    _count: { _all: true },
  });
  return { messages: rows._sum.unreadCount ?? 0, conversations: rows._count._all };
}
