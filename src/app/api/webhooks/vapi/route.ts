import { NextResponse } from "next/server";

import { handleVapiWebhook } from "@/server/voice/webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Webhook da Vapi (agente de voz): ligações recebidas, ferramentas e fim de chamada. */
export async function POST(request: Request) {
  try {
    const { status, body } = await handleVapiWebhook(request);
    return NextResponse.json(body, { status });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[vapi] webhook falhou:", err);
    // Vapi ignora códigos != 200 em tool-calls; devolve 200 com erro para não travar a ligação.
    return NextResponse.json({ error: "erro interno" }, { status: 200 });
  }
}
