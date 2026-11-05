import { makeWebhookHandlers } from "@/server/webhooks/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// O agente SDR roda depois da resposta 200 (via `after`) e conversa com o Claude.
export const maxDuration = 60;

export const { GET, POST } = makeWebhookHandlers("INSTAGRAM");
