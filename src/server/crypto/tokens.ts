import crypto from "node:crypto";

/**
 * Cifra/decifra tokens de canal em repouso (item 10).
 * AES-256-GCM. A chave mestra vem de CHANNEL_TOKEN_ENCRYPTION_KEY (32 bytes em
 * base64). O valor cifrado NUNCA vai para o frontend.
 *
 * Formato guardado: base64(iv).base64(authTag).base64(ciphertext)
 */

function key(): Buffer {
  const raw = process.env.CHANNEL_TOKEN_ENCRYPTION_KEY;
  if (!raw) throw new Error("CHANNEL_TOKEN_ENCRYPTION_KEY não configurada.");
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) {
    throw new Error("CHANNEL_TOKEN_ENCRYPTION_KEY deve ter 32 bytes (base64). Gere com: openssl rand -base64 32");
  }
  return buf;
}

export function encryptToken(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(".");
}

export function decryptToken(stored: string): string {
  const [ivB64, tagB64, dataB64] = stored.split(".");
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("Token cifrado em formato inválido.");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
}

/** Mostra só os 4 últimos caracteres, para a UI. */
export function maskToken(stored: string | null): string {
  if (!stored) return "—";
  try {
    const t = decryptToken(stored);
    return `••••${t.slice(-4)}`;
  } catch {
    return "•••• (erro ao ler)";
  }
}
