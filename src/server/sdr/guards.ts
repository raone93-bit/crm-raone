import type { Channel } from "@prisma/client";

/**
 * Regras de segurança do agente SDR — funções puras, testadas em
 * tests/sdr.test.ts. Decidem SE o agente pode responder; o QUÊ responder é
 * com o agente (src/server/sdr/agent.ts).
 */

/** Canais em que o agente pode responder sozinho. E-mail nunca, por ora. */
export const AUTOPILOT_CHANNELS: Channel[] = ["WHATSAPP", "INSTAGRAM", "FACEBOOK"];

/** Janela de atendimento da Meta: resposta livre só até 24 h da última mensagem do cliente. */
export const META_WINDOW_MS = 24 * 60 * 60 * 1000;

export type AutoReplyInput = {
  settings: { enabled: boolean; channels: Channel[]; maxRepliesPerDay: number } | null;
  aiConfigured: boolean;
  channel: Channel;
  conversation: { aiPaused: boolean; status: string };
  contactBlocked: boolean;
  /** A mensagem que disparou é a última INBOUND da conversa? (debounce) */
  isLatestInbound: boolean;
  /** Já existe resposta (humana ou IA) depois da mensagem que disparou? */
  alreadyAnswered: boolean;
  lastInboundAt: Date;
  aiRepliesLast24h: number;
  now?: Date;
};

export type AutoReplyDecision = { ok: true } | { ok: false; reason: string };

export function decideAutoReply(i: AutoReplyInput): AutoReplyDecision {
  const now = i.now ?? new Date();
  if (!i.aiConfigured) return { ok: false, reason: "IA sem chave (ANTHROPIC_API_KEY)" };
  if (!i.settings?.enabled) return { ok: false, reason: "agente desligado" };
  if (!AUTOPILOT_CHANNELS.includes(i.channel)) return { ok: false, reason: `canal ${i.channel} fora do piloto automático` };
  if (!i.settings.channels.includes(i.channel)) return { ok: false, reason: `canal ${i.channel} desativado no agente` };
  if (i.contactBlocked) return { ok: false, reason: "contato bloqueado" };
  if (i.conversation.aiPaused) return { ok: false, reason: "agente pausado nesta conversa" };
  if (i.conversation.status === "CLOSED") return { ok: false, reason: "conversa fechada" };
  if (!i.isLatestInbound) return { ok: false, reason: "chegou mensagem mais nova — ela dispara a resposta" };
  if (i.alreadyAnswered) return { ok: false, reason: "mensagem já respondida" };
  if (now.getTime() - i.lastInboundAt.getTime() > META_WINDOW_MS) {
    return { ok: false, reason: "fora da janela de 24 h da Meta" };
  }
  if (i.aiRepliesLast24h >= i.settings.maxRepliesPerDay) {
    return { ok: false, reason: `limite de ${i.settings.maxRepliesPerDay} respostas automáticas em 24 h` };
  }
  return { ok: true };
}

/** Cliente pediu para parar de receber mensagens? (LGPD / política da Meta) */
export function detectOptOut(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (!t) return false;
  // Mensagem curta que é só o comando.
  if (/^(stop|pare|parar|sair|cancelar|unsubscribe|baja|basta)[.!\s]*$/.test(t)) return true;
  return /(n[aã]o (quero|desejo) (mais )?receber|para de me mandar|pare de me mandar|me (tira|remova|remove) d(a|essa) lista|stop (messaging|texting|contacting) me|don'?t (message|text|contact) me|no (me )?(escriban|contacten) m[aá]s)/.test(
    t,
  );
}

/** Cliente pediu para falar com uma pessoa? Aí o agente passa o caso na hora. */
export function asksForHuman(text: string): boolean {
  const t = text.toLowerCase();
  return /(falar com (um|uma|algu[eé]m|o|a) (atendente|humano|pessoa|vendedor|vendedora|respons[aá]vel)|atendente humano|talk to (a )?(human|person|real person|someone|sales ?rep|salesperson)|speak (to|with) (a )?(human|person|someone|sales)|hablar con (alguien|(un |una |el |la )?(persona|humano|vendedor|vendedora|asesor|asesora|agente)))/.test(
    t,
  );
}

export type ReplyCheck = { ok: true } | { ok: false; reason: string };

/**
 * Guardrail da resposta final (item 40): preço, prazo de entrega/embarque e
 * condição de pagamento NUNCA saem do agente — isso é com o vendedor.
 * Estoque só pode ser citado se o agente consultou o estoque real nesta vez.
 */
export function checkReply(text: string, ctx: { availabilityChecked: boolean }): ReplyCheck {
  const t = text.trim();
  if (!t) return { ok: false, reason: "resposta vazia" };
  if (t.length > 1200) return { ok: false, reason: "resposta longa demais para chat" };

  const price =
    /((us)?\$|r\$|€|usd|eur|brl)\s?\d|\d[\d.,]*\s?(usd|eur|brl|reais|d[oó]lares|dollars|euros)\b|\d+\s?(\/\s?m²|\/\s?m2|per m2|per sqm|por m²|por m2|\/sqft|per sq ?ft)/i;
  if (price.test(t)) return { ok: false, reason: "citou preço" };

  const leadTime =
    /(entrega(mos)? em \d|embarque em \d|ship(ping|s)? (with)?in \d|deliver(y|ed)? (with)?in \d|\d+\s?(dias|days|semanas|weeks|d[ií]as)\s+(para|to|de|for)\s+(entrega|embarque|ship|deliver|env[ií]o))/i;
  if (leadTime.test(t)) return { ok: false, reason: "prometeu prazo" };

  const payment = /(\d+\s?%\s?(de )?(entrada|adiantad|advance|down ?payment|anticipo)|carta de cr[eé]dito garantida|we accept (lc|l\/c) at sight)/i;
  if (payment.test(t)) return { ok: false, reason: "definiu condição de pagamento" };

  if (!ctx.availabilityChecked) {
    const stock = /(temos em estoque|tenemos en stock|in stock|em estoque|pronta entrega|dispon[ií]vel agora|available now|ready to ship)/i;
    if (stock.test(t)) return { ok: false, reason: "afirmou estoque sem consultar" };
  }
  return { ok: true };
}
