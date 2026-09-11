import { NextResponse } from "next/server";

import { processWebhookQueue } from "@/server/webhooks/process";
import { flushOutbound } from "@/server/channels/outbound";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cron (a cada minuto). Drena a fila de webhooks e envia as mensagens pendentes.
 * Protegido por CRON_SECRET (a Vercel injeta o header Authorization no cron).
 */
export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const [inbound, outbound] = await Promise.all([processWebhookQueue(50), flushOutbound(50)]);

  return NextResponse.json({ ok: true, inbound, outbound });
}
