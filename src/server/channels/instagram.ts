import type { ChannelAdapter, ParsedInbound, ParsedStatus, RoutingHint, SendConfig } from "./types";
import { graphPost } from "./graph";

/**
 * Instagram Messaging API (via Messenger Platform).
 * https://developers.facebook.com/docs/messenger-platform/instagram
 * Exige conta profissional do Instagram vinculada a uma Página + App Review.
 */
export const instagramAdapter: ChannelAdapter = {
  channel: "INSTAGRAM",

  routingHint(payload: any): RoutingHint {
    // entry[].id = id da conta do Instagram que recebeu a mensagem
    return { igAccountId: payload?.entry?.[0]?.id };
  },

  parseInbound(payload: any): ParsedInbound[] {
    const out: ParsedInbound[] = [];
    for (const entry of payload?.entry ?? []) {
      const recipientId = entry?.id;
      for (const ev of entry?.messaging ?? []) {
        if (ev?.message?.is_echo) continue; // eco da própria página
        const msg = ev?.message;
        if (!msg) continue;

        const attachments: any[] = msg?.attachments ?? [];
        let type: ParsedInbound["type"] = "TEXT";
        let mediaUrl: string | null = null;
        if (attachments[0]) {
          const t = attachments[0]?.type;
          type = t === "image" ? "IMAGE" : t === "video" ? "VIDEO" : t === "audio" ? "AUDIO" : "DOCUMENT";
          mediaUrl = attachments[0]?.payload?.url ?? null;
        }

        out.push({
          channel: "INSTAGRAM",
          externalContactId: ev?.sender?.id,
          contactName: null,
          externalThreadId: ev?.sender?.id ?? recipientId,
          externalMessageId: msg?.mid,
          text: msg?.text ?? (mediaUrl ? "[mídia]" : "[mensagem]"),
          type,
          mediaUrl,
          timestamp: ev?.timestamp ? new Date(Number(ev.timestamp)) : null,
          source: "webhook",
        });
      }
    }
    return out;
  },

  parseStatus(payload: any): ParsedStatus[] {
    const out: ParsedStatus[] = [];
    for (const entry of payload?.entry ?? []) {
      for (const ev of entry?.messaging ?? []) {
        if (ev?.delivery?.mids) {
          for (const mid of ev.delivery.mids) out.push({ externalMessageId: mid, status: "DELIVERED" });
        }
        if (ev?.read) {
          // IG read não traz mid; ignoramos por ora.
        }
      }
    }
    return out;
  },

  async sendText(config: SendConfig, to: string, text: string) {
    const id = config.igAccountId ?? "me";
    const res = await graphPost(`${id}/messages`, config.accessToken, {
      recipient: { id: to },
      message: { text },
    });
    const messageId = res?.message_id;
    if (!messageId) throw new Error("Instagram: resposta sem message_id.");
    return { externalId: messageId };
  },
};
