import { prisma } from "@/lib/prisma";
import { adapterForChannel, sendConfigFor } from "@/server/channels/registry";

/**
 * Envia as mensagens de saída que estão na fila (status QUEUED).
 * Chamado logo após o vendedor responder e também pelo cron, como rede de
 * segurança. Sem integração conectada, a mensagem simplesmente continua na fila.
 */
export async function flushOutbound(limit = 20): Promise<{ sent: number; failed: number; pending: number }> {
  const result = { sent: 0, failed: 0, pending: 0 };

  const queued = await prisma.message.findMany({
    where: { direction: "OUTBOUND", status: "QUEUED" },
    include: { conversation: true },
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  for (const msg of queued) {
    const adapter = adapterForChannel(msg.channel);
    if (!adapter) {
      result.pending += 1;
      continue;
    }
    const config = await sendConfigFor(msg.organizationId, msg.channel);
    if (!config) {
      result.pending += 1;
      continue;
    }

    // Destinatário: o external id do contato no canal.
    const identity = await prisma.contactIdentity.findFirst({
      where: {
        organizationId: msg.organizationId,
        contactId: msg.conversation.contactId,
        channel: msg.channel,
      },
    });
    if (!identity) {
      await prisma.message.update({
        where: { id: msg.id },
        data: { status: "FAILED", errorMessage: "Contato sem identidade neste canal." },
      });
      result.failed += 1;
      continue;
    }

    try {
      const { externalId } = await adapter.sendText(config, identity.externalId, msg.text ?? "");
      await prisma.message.update({
        where: { id: msg.id },
        data: { status: "SENT", externalMessageId: externalId, errorMessage: null },
      });
      await prisma.conversation.update({
        where: { id: msg.conversationId },
        data: { status: "OPEN" },
      });
      result.sent += 1;
    } catch (err) {
      await prisma.message.update({
        where: { id: msg.id },
        data: {
          status: "FAILED",
          errorMessage: err instanceof Error ? err.message : String(err),
        },
      });
      result.failed += 1;
    }
  }

  return result;
}
