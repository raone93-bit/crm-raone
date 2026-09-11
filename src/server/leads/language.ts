import type { Language } from "@prisma/client";

/**
 * Heurística de idioma para operar ANTES da IA (Fase 4) e como fallback.
 * A Fase 4 substitui isto pela análise do LLM sobre o texto real da conversa.
 * O critério é o idioma da mensagem — nunca país, DDD ou idioma do app (item 13).
 */

const PT = [
  "você","voce","vocês","voces","olá","ola","gostaria","preço","preco","obrigado","obrigada",
  "bom dia","boa tarde","boa noite","tem","têm","teria","disponível","disponivel","quanto","quero",
  "chapa","chapas","pedra","espessura","acabamento","frete","cotação","cotacao","não","nao","sim","para",
];
const ES = [
  "hola","gracias","buenos días","buenos dias","buenas tardes","buenas noches","precio","tienen","tiene",
  "quisiera","disponible","cuánto","cuanto","cuál","cual","para","proyecto","losa","losas","piedra",
  "espesor","acabado","flete","cotización","cotizacion","necesito","quiero","están","estan","sí",
];
const EN = [
  "hello","hi","hey","thanks","thank you","good morning","price","do you","are you","would like",
  "available","how much","which","for","project","slab","slabs","stone","thickness","finish","freight",
  "quote","need","looking for","have","ship","shipping","quartzite","granite","marble",
];

function countHits(text: string, list: string[]): number {
  const t = ` ${text.toLowerCase()} `;
  let n = 0;
  for (const w of list) {
    // palavra/expressão com fronteira simples
    if (t.includes(` ${w} `) || t.includes(`${w} `) || t.includes(` ${w}`)) n += 1;
  }
  return n;
}

export function detectLanguage(text: string): { language: Language; confidence: number } {
  const clean = (text ?? "").trim();
  if (clean.replace(/[^\p{L}]/gu, "").length < 2) {
    return { language: "OTHER", confidence: 0.2 };
  }

  const scores: Record<Language, number> = {
    PT: countHits(clean, PT),
    ES: countHits(clean, ES),
    EN: countHits(clean, EN),
    OTHER: 0,
  };

  // Sinais fortes de diacríticos/estruturas.
  if (/[ãõ]|ção\b|ções\b|nh|lh/i.test(clean)) scores.PT += 2;
  if (/¿|¡|ñ|ción\b|ciones\b/i.test(clean)) scores.ES += 2;

  const entries = (Object.entries(scores) as [Language, number][])
    .filter(([lang]) => lang !== "OTHER")
    .sort((a, b) => b[1] - a[1]);

  const [top, second] = entries;
  if (!top || top[1] === 0) return { language: "OTHER", confidence: 0.3 };

  const margin = top[1] - (second?.[1] ?? 0);
  const confidence = Math.min(0.95, 0.5 + margin * 0.12 + top[1] * 0.05);
  return { language: top[0], confidence: Number(confidence.toFixed(2)) };
}
