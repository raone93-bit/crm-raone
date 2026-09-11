import type { IntentType } from "@prisma/client";

/**
 * Detecção de intenção comercial — regra do item 2:
 * lead só nasce de contato comercial real. Curtir, seguir, "linda pedra!"
 * NÃO geram lead.
 *
 * Esta é a versão determinística, para operar antes da IA (Fase 4) e como
 * fallback. A Fase 4 usa o LLM com o contexto completo da conversa; o
 * contrato de saída (hasCommercialIntent + intentType) é o mesmo.
 */

export type IntentResult = {
  hasCommercialIntent: boolean;
  intentType: IntentType;
  matched: string[];
};

// Termos que, sozinhos ou combinados com pergunta, indicam intenção comercial.
const SIGNALS: { type: IntentType; terms: RegExp[] }[] = [
  {
    type: "PRICE",
    terms: [
      /\bpre[cç]o\b/i, /\bvalor\b/i, /quanto custa/i, /quanto (é|e|fica|sai)/i,
      /\bprecio\b/i, /cu[aá]nto (cuesta|vale|sale)/i, /\bprice\b/i, /how much/i,
      /\bcost\b/i, /\bpor m2\b/i, /por m²/i, /per (sqm|m2|square meter)/i,
    ],
  },
  {
    type: "AVAILABILITY",
    terms: [
      /dispon[ií]vel/i, /tem em estoque/i, /voc[eê]s? t[eê]m/i, /t[eê]m (essa|esse|a|o)\b/i,
      /voc[eê]s? (vende|vendem|trabalham? com|fornece|têm)/i,
      /disponible/i, /tienen\b/i, /tiene\b/i, /venden?\b/i, /hay (stock|disponibilidad)/i,
      /\bavailable\b/i, /in stock/i, /do you (have|sell|carry|stock|offer|export|ship)\b/i,
      /have (this|any|it)\b/i,
    ],
  },
  {
    type: "QUOTE",
    terms: [/cota[cç][aã]o/i, /or[cç]amento/i, /cotizaci[oó]n/i, /presupuesto/i, /\bquote\b/i, /\bquotation\b/i, /\bproforma\b/i],
  },
  {
    type: "SAMPLE",
    terms: [/amostra/i, /\bmuestra\b/i, /\bsample\b/i, /\bswatch\b/i],
  },
  {
    type: "FREIGHT",
    terms: [/\bfrete\b/i, /\bflete\b/i, /\bfreight\b/i, /\bshipping\b/i, /\bfob\b/i, /\bcif\b/i, /\bcfr\b/i, /\bexw\b/i],
  },
  {
    type: "EXPORT",
    terms: [
      /export/i, /\bcontainer\b/i, /cont[eê]iner/i, /\bimport(er|ador|ación|acao)?\b/i,
      /vend(e|em) para (os )?(estados unidos|eua|miami|europa)/i, /ship to\b/i, /sell to\b/i,
      /para (miami|usa|estados unidos|europa)/i,
    ],
  },
  {
    type: "PROJECT",
    terms: [/\bprojeto\b/i, /\bproyecto\b/i, /\bproject\b/i, /\bobra\b/i, /pre[cç]iso de \d/i, /need \d+\s*(m2|m²|sqm|square)/i, /\d+\s*(m2|m²|sqm)\b/i],
  },
  {
    type: "MEDIA_REQUEST",
    terms: [
      /\bfotos?\b/i, /\bv[ií]deos?\b/i, /\bphotos?\b/i, /\bpictures?\b/i, /manda(r)? (foto|v[ií]deo)/i,
      /send (me )?(photos|pictures|a video|videos)/i, /med(idas|ida)\b/i, /\bthickness\b/i, /espessura/i,
    ],
  },
];

// Puramente social — não gera lead se aparecer SOZINHO (item 3).
const SOCIAL_ONLY = [
  /^(linda|lindo|linda!|que linda|bonita|hermosa|precios[ao]|beautiful|gorgeous|wow|amei|love it|nice|top|👏|❤️|🔥)+[\s!.]*$/i,
  /^(parab[eé]ns|felicidades|congrats|congratulations)[\s!.]*$/i,
];

function isQuestion(text: string): boolean {
  return /\?/.test(text) || /^(voc[eê]s?|t[eê]m|tem|qual|quanto|quando|onde|como|do you|are you|can you|could you|how|what|when|where|which|hay|tienen|tiene|cu[aá]l|cu[aá]nto)\b/i.test(text.trim());
}

export function detectIntent(rawText: string): IntentResult {
  const text = (rawText ?? "").trim();
  if (!text) return { hasCommercialIntent: false, intentType: "OTHER", matched: [] };

  if (SOCIAL_ONLY.some((re) => re.test(text))) {
    return { hasCommercialIntent: false, intentType: "GREETING", matched: [] };
  }

  const matched: string[] = [];
  let firstType: IntentType | null = null;
  for (const group of SIGNALS) {
    for (const re of group.terms) {
      if (re.test(text)) {
        matched.push(group.type);
        if (!firstType) firstType = group.type;
        break;
      }
    }
  }

  // Menção a material de pedra + pergunta também conta como intenção.
  const mentionsStone =
    /\b(taj mahal|super white|cristallo|white pearl|calacatta|quartzite|granite|granito|m[aá]rmore|marble|dolomite|dolomita|soapstone|quartzo?|quartz|slab|slabs|chapa|chapas|bundle|bloco|block|pedra|piedra|stone|natural stone)\b/i.test(text);

  if (matched.length > 0) {
    return {
      hasCommercialIntent: true,
      intentType: firstType ?? "OTHER",
      matched: [...new Set(matched)],
    };
  }

  if (mentionsStone && isQuestion(text)) {
    return { hasCommercialIntent: true, intentType: "AVAILABILITY", matched: ["stone_question"] };
  }

  return { hasCommercialIntent: false, intentType: "GREETING", matched: [] };
}
