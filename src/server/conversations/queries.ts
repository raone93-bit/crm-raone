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
    include: {
      contact: { include: { identities: true } },
      seller: true,
    },
    orderBy: { lastMessageAt: "desc" },
    take: 100,
  });
}

export async function getConversation(user: CurrentUser, id: string) {
  const conversation = await prisma.conversation.findFirst({
    where: { id, ...conversationVisibilityWhere(user) },
    include: {
      contact: {
        include: {
          identities: true,
          customer: true,
          leads: {
            where: { wonAt: null, lostAt: null },
            orderBy: { updatedAt: "desc" },
            take: 1,
            include: { stage: true, seller: true, material: true, scoreFactors: true },
          },
        },
      },
      seller: { include: { user: true } },
      messages: { orderBy: { createdAt: "asc" }, include: { aiAnalysis: true } },
    },
  });
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
