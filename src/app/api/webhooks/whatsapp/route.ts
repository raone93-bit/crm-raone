import { makeWebhookHandlers } from "@/server/webhooks/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const { GET, POST } = makeWebhookHandlers("WHATSAPP");
