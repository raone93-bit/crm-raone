import type { Language } from "@prisma/client";

/**
 * Distribuição de leads por idioma (item 12).
 *   PT  → Rodolfo
 *   ES  → Gabriel
 *   EN  → Gabriel
 *   outro/indefinido → fila de triagem
 *
 * As regras são DADOS (tabela RoutingRule), configuráveis pelo admin.
 * Esta função só aplica a tabela; o seed cria as regras padrão.
 */

export type RoutingRuleInput = {
  language: Language;
  sellerId: string;
  active: boolean;
};

export type RoutingResult = {
  sellerId: string | null;
  isTriage: boolean;
  reason: string;
};

export function routeLead(
  language: Language,
  rules: RoutingRuleInput[],
  triageSellerId: string | null,
): RoutingResult {
  const rule = rules.find((r) => r.active && r.language === language);
  if (rule) {
    return { sellerId: rule.sellerId, isTriage: false, reason: `idioma ${language}` };
  }
  return {
    sellerId: triageSellerId,
    isTriage: true,
    reason: language === "OTHER" ? "idioma indefinido" : `sem regra para ${language}`,
  };
}
