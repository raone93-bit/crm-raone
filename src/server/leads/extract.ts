import type { Finish } from "@prisma/client";

/**
 * Extração determinística de campos comerciais da conversa.
 * Roda antes da IA (Fase 4) e como fallback. NUNCA inventa: só devolve o que
 * está escrito no texto (item 40).
 */

export type ExtractedFields = {
  material?: string;
  thicknessCm?: number;
  finish?: Finish;
  squareMeters?: number;
  quantitySlabs?: number;
  hasProject: boolean;
  city?: string;
  asRecord: Record<string, unknown>;
};

// Nomes comerciais conhecidos (o catálogo real, na Fase 5, alimenta esta lista).
const KNOWN_MATERIALS = [
  "Taj Mahal", "Super White", "Cristallo", "White Pearl", "Calacatta",
  "Mont Blanc", "Patagonia", "Fusion", "Azul Macaubas", "Belvedere",
  "Preto São Marcos", "Preto Absoluto", "Via Lattea", "Perla Venata",
  "Sea Pearl", "Madre Perola", "Quartzite", "Granito", "Mármore", "Dolomite",
];

const FINISHES: { re: RegExp; value: Finish }[] = [
  { re: /\bpoli(do|sh(ed)?)\b|\bpulido\b|\blucido\b/i, value: "POLISHED" },
  { re: /\bhoned?\b|\bapicoad\w*\b|\bmate\b|\bfosco\b/i, value: "HONED" },
  { re: /\bleather(ed)?\b|\bcouro\b|\bcuero\b/i, value: "LEATHER" },
  { re: /\bbrushed?\b|\bescovad\w*\b|\bcepillad\w*\b/i, value: "BRUSHED" },
  { re: /\bsandblast\w*\b|\bjatead\w*\b/i, value: "SANDBLASTED" },
];

function num(raw: string): number | undefined {
  const n = parseFloat(raw.replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
}

export function extractLeadFields(text: string): ExtractedFields {
  const t = text ?? "";
  const out: ExtractedFields = { hasProject: false, asRecord: {} };

  // Material
  for (const m of KNOWN_MATERIALS) {
    if (new RegExp(`\\b${m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(t)) {
      out.material = m;
      break;
    }
  }

  // Espessura em cm (2 cm, 3cm, 2 centímetros, 20 mm)
  const cm = t.match(/(\d+(?:[.,]\d+)?)\s*(?:cm|cent[íi]metros?|centimeters?)\b/i);
  const mm = t.match(/(\d+(?:[.,]\d+)?)\s*mm\b/i);
  if (cm) out.thicknessCm = num(cm[1]);
  else if (mm) {
    const v = num(mm[1]);
    if (v) out.thicknessCm = v / 10;
  }

  // Acabamento
  for (const f of FINISHES) {
    if (f.re.test(t)) {
      out.finish = f.value;
      break;
    }
  }

  // Metragem (m², m2, sqm, square meters, metros quadrados)
  const sqm = t.match(/(\d+(?:[.,]\d+)?)\s*(?:m²|m2|sqm|sq\.?\s?m|square\s?meters?|metros?\s?quadrados?|m[eé]tros?\s?cuadrados?)\b/i);
  if (sqm) out.squareMeters = num(sqm[1]);

  // Quantidade de chapas / slabs
  const slabs = t.match(/(\d+)\s*(?:chapas?|slabs?|losas?|placas?)\b/i);
  if (slabs) out.quantitySlabs = parseInt(slabs[1], 10);

  // Projeto
  if (/\bprojeto\b|\bproyecto\b|\bproject\b|\bobra\b|\bresidential\b|\bresidencial\b|\bcomercial\b|\bcommercial\b|\bkitchen\b|\bcozinha\b|\bbathroom\b|\bbanheiro\b/i.test(t)) {
    out.hasProject = true;
  }

  // Cidade (padrões "in Miami", "em São Paulo", "para Miami")
  const city = t.match(/\b(?:in|em|para|to|en)\s+([A-ZÀ-Ý][a-zà-ýA-ZÀ-Ý]+(?:\s[A-ZÀ-Ý][a-zà-ý]+)?)/);
  if (city && !/^(the|a|o|um|uma)$/i.test(city[1])) out.city = city[1];

  out.asRecord = {
    ...(out.material ? { material: out.material } : {}),
    ...(out.thicknessCm ? { thicknessCm: out.thicknessCm } : {}),
    ...(out.finish ? { finish: out.finish } : {}),
    ...(out.squareMeters ? { squareMeters: out.squareMeters } : {}),
    ...(out.quantitySlabs ? { quantity: out.quantitySlabs } : {}),
    ...(out.hasProject ? { project: true } : {}),
    ...(out.city ? { city: out.city } : {}),
  };

  return out;
}
