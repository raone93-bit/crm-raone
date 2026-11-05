import crypto from "node:crypto";

/**
 * Funções puras do agente de voz (testadas em tests/voice.test.ts):
 * URL pública, assinatura do contexto da ligação, telefone E.164 e janela de
 * horário comercial no fuso do cliente.
 */

export function vapiConfigured(): boolean {
  return !!process.env.VAPI_API_KEY && !!process.env.VAPI_WEBHOOK_SECRET;
}

/** URL pública do CRM (a Vapi chama os webhooks aqui). */
export function appUrl(): string {
  const explicit = process.env.APP_URL?.replace(/\/$/, "");
  if (explicit) return explicit;
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  return vercel ? `https://${vercel}` : "http://localhost:3000";
}

// ── Contexto assinado ───────────────────────────────────────────────────────
// Vai na URL do webhook de cada ligação: diz de qual org/contato/lead é a
// chamada e prova que fomos nós que criamos (HMAC com VAPI_WEBHOOK_SECRET).

export type CallContext = {
  o: string; // organizationId
  k: string; // contactId
  c: string; // conversationId
  l?: string | null; // leadId
  p: "inbound" | "scheduled" | "reactivation" | "manual";
};

export function signContext(ctx: CallContext, secret: string): string {
  const body = Buffer.from(JSON.stringify(ctx)).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyContext(token: string | null | undefined, secret: string): CallContext | null {
  if (!token || !secret) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    return parsed && typeof parsed.o === "string" && typeof parsed.k === "string" ? (parsed as CallContext) : null;
  } catch {
    return null;
  }
}

/** Confere o segredo do webhook em qualquer um dos headers que a Vapi usa. */
export function headerSecretOk(headers: Headers, secret: string): boolean {
  if (!secret) return false;
  const auth = headers.get("authorization");
  const candidates = [
    auth?.startsWith("Bearer ") ? auth.slice(7) : auth,
    headers.get("x-vapi-secret"),
    headers.get("x-crm-secret"),
  ].filter((v): v is string => !!v);
  return candidates.some((v) => {
    const a = Buffer.from(v);
    const b = Buffer.from(secret);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  });
}

// ── Telefone ────────────────────────────────────────────────────────────────

/**
 * Normaliza para E.164. Aceita "+55 27 99999-0000", "0044 20…" e o número do
 * WhatsApp ("5527999990000", sempre com DDI — passe `fromWhatsApp`). Sem "+"
 * e sem DDI garantido, só aceita número brasileiro começando com 55; o resto
 * fica null (não chuta o país).
 */
export function toE164(raw: string | null | undefined, opts: { fromWhatsApp?: boolean } = {}): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) return null;
  if (trimmed.startsWith("+")) return `+${digits}`;
  if (trimmed.startsWith("00")) return digits.length - 2 >= 8 ? `+${digits.slice(2)}` : null;
  if (opts.fromWhatsApp && digits.length >= 10) return `+${digits}`;
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) return `+${digits}`;
  return null;
}

// ── Horário comercial no fuso do cliente ───────────────────────────────────

const COUNTRY_TZ: Record<string, string> = {
  BR: "America/Sao_Paulo",
  US: "America/New_York",
  CA: "America/Toronto",
  MX: "America/Mexico_City",
  CO: "America/Bogota",
  PE: "America/Lima",
  CL: "America/Santiago",
  AR: "America/Argentina/Buenos_Aires",
  UY: "America/Montevideo",
  PY: "America/Asuncion",
  PA: "America/Panama",
  DO: "America/Santo_Domingo",
  PR: "America/Puerto_Rico",
  GB: "Europe/London",
  IE: "Europe/Dublin",
  PT: "Europe/Lisbon",
  ES: "Europe/Madrid",
  FR: "Europe/Paris",
  IT: "Europe/Rome",
  DE: "Europe/Berlin",
  NL: "Europe/Amsterdam",
  BE: "Europe/Brussels",
  PL: "Europe/Warsaw",
  AE: "Asia/Dubai",
  SA: "Asia/Riyadh",
  IL: "Asia/Jerusalem",
  IN: "Asia/Kolkata",
  CN: "Asia/Shanghai",
  AU: "Australia/Sydney",
};

const COUNTRY_ALIASES: Record<string, string> = {
  BRASIL: "BR", BRAZIL: "BR", USA: "US", "UNITED STATES": "US", EUA: "US", "ESTADOS UNIDOS": "US",
  MEXICO: "MX", MÉXICO: "MX", CANADA: "CA", CANADÁ: "CA", UK: "GB", "UNITED KINGDOM": "GB", "REINO UNIDO": "GB",
  ESPANHA: "ES", SPAIN: "ES", ESPAÑA: "ES", ITALIA: "IT", ITÁLIA: "IT", ITALY: "IT", PORTUGAL: "PT",
  COLOMBIA: "CO", COLÔMBIA: "CO", CHILE: "CL", PERU: "PE", PERÚ: "PE", ARGENTINA: "AR",
};

/** DDI → país (para quando o contato não tem país cadastrado). */
const DIAL_PREFIX: [string, string][] = [
  ["+55", "BR"], ["+52", "MX"], ["+57", "CO"], ["+51", "PE"], ["+56", "CL"], ["+54", "AR"], ["+598", "UY"],
  ["+44", "GB"], ["+351", "PT"], ["+34", "ES"], ["+33", "FR"], ["+39", "IT"], ["+49", "DE"], ["+31", "NL"],
  ["+971", "AE"], ["+966", "SA"], ["+972", "IL"], ["+91", "IN"], ["+86", "CN"], ["+61", "AU"], ["+1", "US"],
];

export function timezoneFor(country: string | null | undefined, phoneE164: string | null | undefined): string {
  const c = country?.trim().toUpperCase();
  const code = c ? (COUNTRY_TZ[c] ? c : COUNTRY_ALIASES[c]) : undefined;
  if (code && COUNTRY_TZ[code]) return COUNTRY_TZ[code];
  if (phoneE164) {
    const hit = DIAL_PREFIX.filter(([p]) => phoneE164.startsWith(p)).sort((a, b) => b[0].length - a[0].length)[0];
    if (hit && COUNTRY_TZ[hit[1]]) return COUNTRY_TZ[hit[1]];
  }
  return "America/Sao_Paulo";
}

/** Partes da data/hora de `d` no fuso `tz`. */
function zonedParts(d: Date, tz: string) {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
  });
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, min: +p.minute, wd: p.weekday as string };
}

/** Converte "dia D, hora H no fuso tz" para um instante UTC. */
function zonedToUtc(y: number, m: number, d: number, h: number, tz: string): Date {
  const guess = new Date(Date.UTC(y, m - 1, d, h, 0, 0));
  const seen = zonedParts(guess, tz);
  const seenUtc = Date.UTC(seen.y, seen.m - 1, seen.d, seen.h, seen.min);
  return new Date(guess.getTime() - (seenUtc - guess.getTime()));
}

/**
 * Próxima janela de horário comercial (seg–sex, das `startHour` às `endHour`)
 * no fuso do cliente. Se já estamos dentro da janela, começa agora.
 */
export function nextBusinessWindow(
  now: Date,
  tz: string,
  startHour = 10,
  endHour = 17,
): { earliestAt: Date; latestAt: Date } {
  for (let add = 0; add < 8; add++) {
    const day = new Date(now.getTime() + add * 24 * 60 * 60 * 1000);
    const p = zonedParts(day, tz);
    if (p.wd === "Sat" || p.wd === "Sun") continue;
    const start = zonedToUtc(p.y, p.m, p.d, startHour, tz);
    const end = zonedToUtc(p.y, p.m, p.d, endHour, tz);
    if (end.getTime() <= now.getTime()) continue;
    return { earliestAt: start.getTime() > now.getTime() ? start : now, latestAt: end };
  }
  // Não deveria chegar aqui; cai para "agora + 1 h".
  return { earliestAt: now, latestAt: new Date(now.getTime() + 60 * 60 * 1000) };
}
