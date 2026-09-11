import crypto from "node:crypto";

/**
 * Valida X-Hub-Signature-256 dos webhooks da Meta.
 * A Meta assina o corpo bruto (raw body) com HMAC-SHA256 usando o App Secret.
 * Header: "sha256=<hex>".
 */
export function verifyMetaSignature(rawBody: string, header: string | null, appSecret: string | undefined): boolean {
  if (!appSecret) return false;
  if (!header || !header.startsWith("sha256=")) return false;

  const expected = crypto.createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  const provided = header.slice("sha256=".length);

  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(provided, "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Handshake de verificação (GET) — hub.mode=subscribe & hub.verify_token.
 * Retorna o challenge (string) se válido, senão null.
 */
export function verifyWebhookChallenge(
  params: URLSearchParams,
  expectedToken: string | undefined,
): string | null {
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");
  if (mode === "subscribe" && token && expectedToken && token === expectedToken) {
    return challenge ?? "";
  }
  return null;
}
