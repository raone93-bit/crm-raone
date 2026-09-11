import { NextResponse } from "next/server";

import { runReactivation } from "@/server/reactivation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  return NextResponse.json({ ok: true, ...summary });
}
