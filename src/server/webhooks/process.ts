import crypto from "node:crypto";
import type { Prisma, WebhookProvider } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { ingestInboundMessage } from "@/server/conversations/ingest";
import { adapterForProvider, resolveIntegration } from "@/server/channels/registry";

const MAX_ATTEMPTS = 5;

/** Grava o evento cru na fila. Idempotente pelo hash do corpo. */
export async function enqueueWebhook(
  provider: WebhookProvider,
  rawBody: string,
  payload: unknown,
  signatureValid: boolean,
): Promise<{ enqueued: boolean; eventId: string }> {
  const eventId = crypto.createHash("sha256").update(`${provider}:${rawBody}`).digest("hex").slice(0, 40);

  try {
    await prisma.webhookEvent.create({
      data: {
        provider,
        eventId,
        signatureValid,
        payload: payload as Prisma.InputJsonValue,
        status: "PENDING",
      },
    });
    return { enqueued: true, eventId };
  } catch {
    // P2002 — evento repetido. Idempotência.
    return { enqueued: false, eventId };
  }
}

export type ProcessSummary = {
  picked: number;
  processed: number;
  failed: number;
  ingested: number;
  statuses: number;
};

/** Drena a fila. Chamado pelo cron (a cada minuto) e após cada webhook. */
export async function processWebhookQueue(limit = 25): Promise<ProcessSummary> {
  const summary: ProcessSummary = { picked: 0, processed: 0, failed: 0, ingested: 0, statuses: 0 };

  const staleBefore = new Date(Date.now() - 5 * 60_000);
  const events = await prisma.webhookEvent.findMany({
    where: {
      OR: [
        { status: "PENDING" },
        { status: "FAILED", attempts: { lt: MAX_ATTEMPTS } },
        // PROCESSING preso (função caiu) — reprocessa depois de 5 min.
        { status: "PROCESSING", attempts: { lt: MAX_ATTEMPTS }, updatedAt: { lt: staleBefore } },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
  summary.picked = events.length;

  for (const event of events) {
    await prisma.webhookEvent.update({
      where: { id: event.id },
      data: { status: "PROCESSING", attempts: { increment: 1 } },
    });

    try {
      const adapter = adapterForProvider(event.provider);
      const payload = event.payload as unknown;

      const integration = await resolveIntegration(event.provider, adapter.routingHint(payload));
      if (!integration) {
        // Sem integração correspondente: marca como ignorado (não é erro nosso).
        await prisma.webhookEvent.update({
          where: { id: event.id },
          data: { status: "SKIPPED", lastError: "Nenhuma integração para o número/página do evento.", processedAt: new Date() },
        });
        continue;
      }

      // Mensagens de entrada → pipeline de ingestão.
      for (const parsed of adapter.parseInbound(payload)) {
        if (!parsed.externalContactId || !parsed.text) continue;
        await ingestInboundMessage({ organizationId: integration.organizationId, ...parsed });
        summary.ingested += 1;
      }

      // Atualizações de status das mensagens que enviamos.
      for (const st of adapter.parseStatus(payload)) {
        if (!st.externalMessageId) continue;
        await prisma.message.updateMany({
          where: {
            organizationId: integration.organizationId,
            externalMessageId: st.externalMessageId,
            direction: "OUTBOUND",
          },
          data: {
            status: st.status,
            errorCode: st.errorCode,
            errorMessage: st.errorMessage,
          },
        });
        summary.statuses += 1;
      }

      await prisma.webhookEvent.update({
        where: { id: event.id },
        data: { status: "PROCESSED", processedAt: new Date(), organizationId: integration.organizationId, lastError: null },
      });
      summary.processed += 1;
    } catch (err) {
      const attempts = event.attempts + 1;
      await prisma.webhookEvent.update({
        where: { id: event.id },
        data: {
          status: attempts >= MAX_ATTEMPTS ? "FAILED" : "PENDING",
          lastError: err instanceof Error ? err.message : String(err),
        },
      });
      summary.failed += 1;
    }
  }

  return summary;
}
