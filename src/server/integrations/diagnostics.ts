import type { IntegrationType, WebhookProvider } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export type ChannelDiagnostic = {
  type: IntegrationType;
  label: string;
  api: { ok: boolean; detail: string };
  webhook: { ok: boolean; detail: string };
  inbound: { ok: boolean; detail: string };
  outbound: { ok: boolean; detail: string };
  lastError: string | null;
  lastSyncAt: Date | null;
  configured: boolean;
};

const CHANNELS: { type: IntegrationType; provider: WebhookProvider; label: string; channel: "WHATSAPP" | "INSTAGRAM" | "FACEBOOK" }[] = [
  { type: "WHATSAPP", provider: "WHATSAPP", label: "WhatsApp Business", channel: "WHATSAPP" },
  { type: "INSTAGRAM", provider: "INSTAGRAM", label: "Instagram Direct", channel: "INSTAGRAM" },
  { type: "FACEBOOK", provider: "FACEBOOK", label: "Facebook Messenger", channel: "FACEBOOK" },
];

export async function getDiagnostics(organizationId: string): Promise<ChannelDiagnostic[]> {
  const since = new Date(Date.now() - 7 * 864e5);

  return Promise.all(
    CHANNELS.map(async (c) => {
      const [integration, lastWebhook, lastInbound, lastOutboundOk, lastOutboundFail] = await Promise.all([
        prisma.integration.findUnique({
          where: { organizationId_type: { organizationId, type: c.type } },
        }),
        prisma.webhookEvent.findFirst({
          where: { provider: c.provider, createdAt: { gte: since } },
          orderBy: { createdAt: "desc" },
        }),
        prisma.message.findFirst({
          where: { organizationId, channel: c.channel, direction: "INBOUND", createdAt: { gte: since } },
          orderBy: { createdAt: "desc" },
        }),
        prisma.message.findFirst({
          where: {
            organizationId,
            channel: c.channel,
            direction: "OUTBOUND",
            status: { in: ["SENT", "DELIVERED", "READ"] },
          },
          orderBy: { createdAt: "desc" },
        }),
        prisma.message.findFirst({
          where: { organizationId, channel: c.channel, direction: "OUTBOUND", status: "FAILED" },
          orderBy: { createdAt: "desc" },
        }),
      ]);

      const connected = integration?.status === "CONNECTED";

      return {
        type: c.type,
        label: c.label,
        configured: !!integration && integration.status !== "NOT_CONFIGURED",
        lastError: integration?.lastError ?? null,
        lastSyncAt: integration?.lastSyncAt ?? null,
        api: {
          ok: connected,
          detail: connected
            ? "Token válido na última verificação"
            : integration?.lastError ?? "Não conectado",
        },
        webhook: {
          ok: !!lastWebhook?.signatureValid,
          detail: lastWebhook
            ? lastWebhook.signatureValid
              ? `Último evento ${lastWebhook.createdAt.toLocaleString("pt-BR")}`
              : "Evento recebido mas assinatura inválida — confira o App Secret"
            : "Nenhum evento recebido ainda",
        },
        inbound: {
          ok: !!lastInbound,
          detail: lastInbound
            ? `Última mensagem recebida ${lastInbound.createdAt.toLocaleString("pt-BR")}`
            : "Nenhuma mensagem recebida",
        },
        outbound: {
          ok: !!lastOutboundOk,
          detail: lastOutboundOk
            ? `Último envio OK ${lastOutboundOk.createdAt.toLocaleString("pt-BR")}`
            : lastOutboundFail
              ? `Falha no envio: ${lastOutboundFail.errorMessage ?? "erro"}`
              : "Nenhum envio ainda",
        },
      };
    }),
  );
}
