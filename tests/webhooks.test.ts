import { describe, expect, it } from "vitest";
import crypto from "node:crypto";

import { verifyMetaSignature, verifyWebhookChallenge } from "@/server/channels/signature";
import { whatsappAdapter } from "@/server/channels/whatsapp";

describe("verifyMetaSignature", () => {
  const secret = "app-secret-123";
  const body = JSON.stringify({ hello: "world" });
  const good = "sha256=" + crypto.createHmac("sha256", secret).update(body).digest("hex");

  it("aceita assinatura correta", () => {
    expect(verifyMetaSignature(body, good, secret)).toBe(true);
  });
  it("rejeita assinatura errada", () => {
    expect(verifyMetaSignature(body, "sha256=deadbeef", secret)).toBe(false);
  });
  it("rejeita corpo adulterado", () => {
    expect(verifyMetaSignature(body + " ", good, secret)).toBe(false);
  });
  it("rejeita sem app secret", () => {
    expect(verifyMetaSignature(body, good, undefined)).toBe(false);
  });
});

describe("verifyWebhookChallenge", () => {
  it("devolve o challenge quando o token confere", () => {
    const p = new URLSearchParams({
      "hub.mode": "subscribe",
      "hub.verify_token": "segredo",
      "hub.challenge": "1234",
    });
    expect(verifyWebhookChallenge(p, "segredo")).toBe("1234");
  });
  it("nega quando o token não confere", () => {
    const p = new URLSearchParams({
      "hub.mode": "subscribe",
      "hub.verify_token": "errado",
      "hub.challenge": "1234",
    });
    expect(verifyWebhookChallenge(p, "segredo")).toBeNull();
  });
});

describe("whatsappAdapter.parseInbound", () => {
  const payload = {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "WABA_ID",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: { display_phone_number: "5527998887777", phone_number_id: "PNID_1" },
              contacts: [{ profile: { name: "John Smith" }, wa_id: "13055551234" }],
              messages: [
                {
                  from: "13055551234",
                  id: "wamid.ABC",
                  timestamp: "1726000000",
                  type: "text",
                  text: { body: "Do you have Taj Mahal 3 cm?" },
                },
              ],
            },
          },
        ],
      },
    ],
  };

  it("extrai a mensagem e o contato", () => {
    const [msg] = whatsappAdapter.parseInbound(payload);
    expect(msg.channel).toBe("WHATSAPP");
    expect(msg.externalContactId).toBe("13055551234");
    expect(msg.phone).toBe("+13055551234");
    expect(msg.contactName).toBe("John Smith");
    expect(msg.text).toBe("Do you have Taj Mahal 3 cm?");
    expect(msg.externalMessageId).toBe("wamid.ABC");
  });

  it("routingHint pega o phone_number_id", () => {
    expect(whatsappAdapter.routingHint(payload)).toEqual({ phoneNumberId: "PNID_1" });
  });

  it("parseStatus mapeia os status de entrega", () => {
    const statusPayload = {
      entry: [
        {
          changes: [
            {
              value: {
                statuses: [{ id: "wamid.ABC", status: "delivered", timestamp: "1726000100", recipient_id: "13055551234" }],
              },
            },
          ],
        },
      ],
    };
    const [st] = whatsappAdapter.parseStatus(statusPayload);
    expect(st).toMatchObject({ externalMessageId: "wamid.ABC", status: "DELIVERED" });
  });
});
