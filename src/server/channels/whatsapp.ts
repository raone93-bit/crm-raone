import type { ChannelAdapter, ParsedInbound, ParsedStatus, RoutingHint, SendConfig } from "./types";
import { graphPost } from "./graph";

const WA_TYPE_MAP: Record<string, ParsedInbound["type"]> = {
  text: "TEXT",
  image: "IMAGE",
  video: "VIDEO",
  audio: "AUDIO",
  document: "DOCUMENT",
};

const STATUS_MAP: Record<string, ParsedStatus["status"]> = {
  sent: "SENT",
  delivered: "DELIVERED",
  read: "READ",
  failed: "FAILED",
};

/** WhatsApp Cloud API — https://developers.facebook.com/docs/whatsapp/cloud-api */
export const whatsappAdapter: ChannelAdapter = {
  channel: "WHATSAPP",

  routingHint(payload: any): RoutingHint {
    const value = payload?.entry?.[0]?.changes?.[0]?.value;
    return { phoneNumberId: value?.metadata?.phone_number_id };
  },

  parseInbound(payload: any): ParsedInbound[] {
    const out: ParsedInbound[] = [];
    for (const entry of payload?.entry ?? []) {
      for (const change of entry?.changes ?? []) {
        const value = change?.value;
        if (change?.field !== "messages" || !value?.messages) continue;

        const contactName = value?.contacts?.[0]?.profile?.name ?? null;

        for (const m of value.messages) {
          const type = WA_TYPE_MAP[m?.type] ?? "TEXT";
          let text = "";
          if (m?.type === "text") text = m.text?.body ?? "";
          else if (m?.[m.type]?.caption) text = m[m.type].caption;
          else text = `[${m?.type ?? "mensagem"}]`;

          out.push({
            channel: "WHATSAPP",
            externalContactId: m?.from,
            contactName,
            phone: m?.from ? `+${String(m.from).replace(/^\+/, "")}` : null,
            externalThreadId: m?.from,
            externalMessageId: m?.id,
            text,
            type,
            timestamp: m?.timestamp ? new Date(Number(m.timestamp) * 1000) : null,
            source: "webhook",
          });
        }
      }
    }
    return out;
  },

  parseStatus(payload: any): ParsedStatus[] {
    const out: ParsedStatus[] = [];
    for (const entry of payload?.entry ?? []) {
      for (const change of entry?.changes ?? []) {
        for (const s of change?.value?.statuses ?? []) {
          const mapped = STATUS_MAP[s?.status];
          if (!mapped) continue;
          out.push({
            externalMessageId: s?.id,
            status: mapped,
            errorCode: s?.errors?.[0]?.code ? String(s.errors[0].code) : undefined,
            errorMessage: s?.errors?.[0]?.title ?? s?.errors?.[0]?.message,
            timestamp: s?.timestamp ? new Date(Number(s.timestamp) * 1000) : undefined,
          });
        }
      }
    }
    return out;
  },

  async sendText(config: SendConfig, to: string, text: string) {
    if (!config.phoneNumberId) throw new Error("WhatsApp: phoneNumberId não configurado.");
    const res = await graphPost(`${config.phoneNumberId}/messages`, config.accessToken, {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: to.replace(/^\+/, ""),
      type: "text",
      text: { body: text, preview_url: false },
    });
    const id = res?.messages?.[0]?.id;
    if (!id) throw new Error("WhatsApp: resposta sem id de mensagem.");
    return { externalId: id };
  },
};
