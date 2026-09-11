/**
 * Funil comercial padrão para venda de rochas naturais (item 20).
 * O admin pode editar as etapas depois; isto é só o ponto de partida do seed.
 */

export type StageSeed = {
  name: string;
  position: number;
  isWon?: boolean;
  isLost?: boolean;
  probability: number;
};

export const DEFAULT_FUNNEL_NAME = "Funil comercial";

export const DEFAULT_STAGES: StageSeed[] = [
  { name: "Novo contato", position: 1, probability: 2 },
  { name: "Lead identificado", position: 2, probability: 5 },
  { name: "Qualificação", position: 3, probability: 10 },
  { name: "Necessidade identificada", position: 4, probability: 15 },
  { name: "Material identificado", position: 5, probability: 20 },
  { name: "Disponibilidade verificada", position: 6, probability: 30 },
  { name: "Cotação solicitada", position: 7, probability: 40 },
  { name: "Cotação enviada", position: 8, probability: 50 },
  { name: "Amostra / seleção", position: 9, probability: 55 },
  { name: "Negociação", position: 10, probability: 65 },
  { name: "Reserva", position: 11, probability: 80 },
  { name: "Pedido confirmado", position: 12, probability: 90 },
  { name: "Pagamento", position: 13, probability: 95 },
  { name: "Logística", position: 14, probability: 98 },
  { name: "Venda concluída", position: 15, isWon: true, probability: 100 },
  { name: "Perdido", position: 16, isLost: true, probability: 0 },
];

export const LOST_REASON_LABELS: Record<string, string> = {
  PRICE: "Preço",
  NO_STOCK: "Sem estoque",
  LEAD_TIME: "Prazo",
  FREIGHT: "Frete",
  CUSTOMER_GAVE_UP: "Cliente desistiu",
  PROJECT_CANCELLED: "Projeto cancelado",
  COMPETITOR: "Concorrente",
  MATERIAL_UNAVAILABLE: "Material indisponível",
  NO_RESPONSE: "Sem retorno",
  OTHER: "Outro",
};
