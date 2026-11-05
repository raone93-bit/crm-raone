import { NextResponse } from "next/server";

import { runReactivation } from "@/server/reactivation";
import { runCallReactivation } from "@/server/voice/reactivation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Cron diário (08:00). Reativação automática de leads parados (item 36):
 * cotação sem resposta, lead morno/quente sem contato. Cria tarefas de
 * follow-up — NUNCA envia mensagem automática.
 */
export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const summary = await runReactivation();
  // Retorno por ligação (agente de voz): só leads que aceitaram receber ligação.
  // As ligações entram agendadas para o horário comercial do país do cliente.
  const calls = await runCallReactivation().catch((err: unknown) => ({ error: err instanceof Error ? err.message : String(err) }));
  return NextResponse.json({ ok: true, ...summary, calls });
}
