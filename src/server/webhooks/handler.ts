import { NextResponse, after } from "next/server";
import type { WebhookProvider } from "@prisma/client";

import { verifyMetaSignature, verifyWebhookChallenge } from "@/server/channels/signature";
import { enqueueWebhook, processWebhookQueue } from "@/server/webhooks/process";

/**
 * Handler comum dos webhooks da Meta (WhatsApp / Instagram / Facebook).
 *
 * GET  → handshake de verificação (hub.challenge). Real, funciona já.
 * POST → valida assinatura, grava na fila (idempotente), responde 200 rápido,
 *        e dispara o processamento em background.
 *
 * O App Secret e o verify token são globais do app da Meta (env). Os tokens de
 * cada número/página são por Integration, cifrados no banco.
 */
export function makeWebhookHandlers(provider: WebhookProvider) {
  async function GET(request: Request) {
    const params = new URL(request.url).searchParams;
    const challenge = verifyWebhookChallenge(params, process.env.META_WEBHOOK_VERIFY_TOKEN);
    if (challenge === null) {
      return new NextResponse("Verificação falhou", { status: 403 });
    }
    return new NextResponse(challenge, {
      status: 200,
      headers: { "content-type": "text/plain" },
    });
  }

  async function POST(request: Request) {
    const rawBody = await request.text();
    const signature = request.headers.get("x-hub-signature-256");
    const signatureValid = verifyMetaSignature(rawBody, signature, process.env.META_APP_SECRET);

    // Em produção, assinatura inválida = rejeita e não grava nada.
    if (!signatureValid && process.env.NODE_ENV === "production" && process.env.META_APP_SECRET) {
      return new NextResponse("Assinatura inválida", { status: 401 });
    }

    let payload: unknown;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return new NextResponse("JSON inválido", { status: 400 });
    }

    const { enqueued } = await enqueueWebhook(provider, rawBody, payload, signatureValid);

    // Responde 200 imediatamente (a Meta reenvia se demorar).
    // `after` mantém a função viva na Vercel para processar depois da resposta;
    // o cron a cada minuto é a rede de segurança.
    if (enqueued) {
      after(async () => {
        try {
          await processWebhookQueue(10);
        } catch {
          /* erros ficam registrados em webhook_events.lastError */
        }
      });
    }

    return NextResponse.json({ received: true, duplicate: !enqueued });
  }

  return { GET, POST };
}
