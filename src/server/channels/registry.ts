import type { Prisma, Channel, IntegrationType, WebhookProvider } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { decryptToken } from "@/server/crypto/tokens";
import type { ChannelAdapter, RoutingHint, SendConfig } from "./types";
import { whatsappAdapter } from "./whatsapp";
import { instagramAdapter } from "./instagram";
import { facebookAdapter } from "./facebook";

const BY_PROVIDER: Record<WebhookProvider, ChannelAdapter> = {
  WHATSAPP: whatsappAdapter,
  INSTAGRAM: instagramAdapter,
  FACEBOOK: facebookAdapter,
};

const BY_CHANNEL: Partial<Record<Channel, ChannelAdapter>> = {
  WHATSAPP: whatsappAdapter,
  INSTAGRAM: instagramAdapter,
  FACEBOOK: facebookAdapter,
};

export function adapterForProvider(p: WebhookProvider): ChannelAdapter {
  return BY_PROVIDER[p];
}

export function adapterForChannel(c: Channel): ChannelAdapter | null {
  return BY_CHANNEL[c] ?? null;
}

export const PROVIDER_TO_TYPE: Record<WebhookProvider, IntegrationType> = {
  WHATSAPP: "WHATSAPP",
  INSTAGRAM: "INSTAGRAM",
  FACEBOOK: "FACEBOOK",
};

/**
 * Acha a Integration (e a organização) dona de um evento, pelo id da conta/número
 * presente no payload. Multi-tenant: um webhook pode servir várias empresas.
 */
export async function resolveIntegration(provider: WebhookProvider, hint: RoutingHint) {
  const type = PROVIDER_TO_TYPE[provider];
  const or: Prisma.IntegrationWhereInput[] = [];
  if (hint.phoneNumberId) or.push({ phoneNumberId: hint.phoneNumberId });
  if (hint.pageId) or.push({ pageId: hint.pageId });
  if (hint.igAccountId) or.push({ igAccountId: hint.igAccountId });

  if (or.length === 0) {
    // Sem hint: se só existe uma integração desse tipo, usa ela.
    const only = await prisma.integration.findMany({ where: { type }, take: 2 });
    return only.length === 1 ? only[0] : null;
  }

  return prisma.integration.findFirst({ where: { type, OR: or } });
}

/** Monta o SendConfig (token decifrado + ids) para envio. */
export async function sendConfigFor(organizationId: string, channel: Channel): Promise<SendConfig | null> {
  if (channel !== "WHATSAPP" && channel !== "INSTAGRAM" && channel !== "FACEBOOK") return null;
  const type: IntegrationType = channel;
  const integration = await prisma.integration.findFirst({
    where: { organizationId, type, status: "CONNECTED" },
  });
  if (!integration?.encryptedToken) return null;

  let accessToken: string;
  try {
    accessToken = decryptToken(integration.encryptedToken);
  } catch {
    return null;
  }

  return {
    accessToken,
    phoneNumberId: integration.phoneNumberId ?? undefined,
    pageId: integration.pageId ?? undefined,
    igAccountId: integration.igAccountId ?? undefined,
  };
}
