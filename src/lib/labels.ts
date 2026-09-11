export const CHANNEL_LABEL: Record<string, string> = {
  WHATSAPP: "WhatsApp",
  INSTAGRAM: "Instagram",
  FACEBOOK: "Facebook",
  EMAIL: "E-mail",
  PHONE: "Telefone",
  MANUAL: "Manual",
  WEBSITE: "Site",
};

export const MATERIAL_TYPE_LABEL: Record<string, string> = {
  GRANITE: "Granito",
  QUARTZITE: "Quartzito",
  MARBLE: "Mármore",
  DOLOMITE: "Dolomito",
  SOAPSTONE: "Pedra-sabão",
  QUARTZ: "Quartzo",
  OTHER: "Outro",
};

export const FINISH_LABEL: Record<string, string> = {
  POLISHED: "Polido",
  HONED: "Apicoado",
  LEATHER: "Couro",
  BRUSHED: "Escovado",
  SANDBLASTED: "Jateado",
  SAWN: "Serrado",
  OTHER: "Outro",
};

export const STOCK_STATUS_LABEL: Record<string, string> = {
  AVAILABLE: "Disponível",
  RESERVED: "Reservado",
  SOLD: "Vendido",
  IN_PRODUCTION: "Em produção",
  IN_NEGOTIATION: "Em negociação",
};

export const QUALITY_LABEL: Record<string, string> = {
  FIRST: "Primeira",
  COMMERCIAL: "Comercial",
  A: "A",
  B: "B",
  C: "C",
};

export const QUOTE_STATUS_LABEL: Record<string, string> = {
  DRAFT: "Rascunho",
  SENT: "Enviada",
  APPROVED: "Aprovada",
  REJECTED: "Recusada",
  EXPIRED: "Vencida",
  CONVERTED: "Convertida em pedido",
};

export const ORDER_STATUS_LABEL: Record<string, string> = {
  CONFIRMED: "Confirmado",
  IN_PRODUCTION: "Em produção",
  READY: "Pronto",
  SHIPPED: "Embarcado",
  DELIVERED: "Entregue",
  CANCELLED: "Cancelado",
};

export const PAYMENT_STATUS_LABEL: Record<string, string> = {
  PENDING: "Pendente",
  PARTIAL: "Parcial",
  PAID: "Pago",
  OVERDUE: "Atrasado",
  CANCELLED: "Cancelado",
};

export const INCOTERM_LABEL: Record<string, string> = {
  EXW: "EXW — Ex Works",
  FOB: "FOB — Free On Board",
  CFR: "CFR — Cost and Freight",
  CIF: "CIF — Cost, Insurance and Freight",
  DAP: "DAP — Delivered At Place",
  DDP: "DDP — Delivered Duty Paid",
};

/** Etapas da carga, em ordem (item 34). */
export const SHIPMENT_FLOW = [
  "ORDER_CONFIRMED",
  "AWAITING_BOOKING",
  "BOOKING_CONFIRMED",
  "AWAITING_EMPTY",
  "EMPTY_SCHEDULED",
  "CONTAINER_LOADED",
  "CONTAINER_GATED_IN",
  "IN_TRANSIT",
  "ARRIVED",
  "DOCUMENTATION",
  "COMPLETED",
] as const;

export const SHIPMENT_DOC_LABEL: Record<string, string> = {
  COMMERCIAL_INVOICE: "Commercial Invoice",
  PACKING_LIST: "Packing List",
  BILL_OF_LADING: "Bill of Lading",
  ISF: "ISF (10+2)",
  CERTIFICATE_OF_ORIGIN: "Certificado de Origem",
  INSURANCE: "Seguro",
  OTHER: "Outro",
};

export const SHIPMENT_DOC_STATUS_LABEL: Record<string, string> = {
  pending: "Pendente",
  in_progress: "Em elaboração",
  ready: "Pronto",
  sent: "Enviado",
  na: "N/A",
};

export const SHIPMENT_STATUS_LABEL: Record<string, string> = {
  ORDER_CONFIRMED: "Pedido confirmado",
  AWAITING_BOOKING: "Aguardando booking",
  BOOKING_CONFIRMED: "Booking confirmado",
  AWAITING_EMPTY: "Aguardando vazio",
  EMPTY_SCHEDULED: "Vazio agendado",
  CONTAINER_LOADED: "Container carregado",
  CONTAINER_GATED_IN: "Container entregue no porto",
  IN_TRANSIT: "Em trânsito",
  ARRIVED: "Chegada ao destino",
  DOCUMENTATION: "Documentação",
  COMPLETED: "Concluído",
};

export const LANGUAGE_LABEL: Record<string, string> = {
  PT: "Português",
  ES: "Espanhol",
  EN: "Inglês",
  OTHER: "Outros",
};

export const MARKET_LABEL: Record<string, string> = {
  DOMESTIC: "Mercado interno",
  USA: "Estados Unidos",
  LATAM: "América Latina",
  EUROPE: "Europa",
  OTHER: "Outros",
};

export const INTENT_LABEL: Record<string, string> = {
  PRICE: "Preço",
  AVAILABILITY: "Disponibilidade",
  SAMPLE: "Amostra",
  QUOTE: "Cotação",
  FREIGHT: "Frete",
  EXPORT: "Exportação",
  PROJECT: "Projeto",
  MEDIA_REQUEST: "Fotos / vídeo",
  GREETING: "Saudação",
  OTHER: "Outro",
};

export const COMPANY_TYPE_LABEL: Record<string, string> = {
  IMPORTER: "Importador",
  DISTRIBUTOR: "Distribuidor",
  FABRICATOR: "Marmoraria",
  ARCHITECT: "Arquiteto",
  DESIGNER: "Designer",
  BUILDER: "Construtora",
  RETAILER: "Varejo",
  OTHER: "Outro",
};

export const LOST_REASON_LABEL: Record<string, string> = {
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

export const VERB_LABEL: Record<string, string> = {
  created_lead: "Lead criado",
  created_contact: "Contato criado",
  created_company: "Empresa criada",
  changed_stage: "Etapa alterada",
  lost_lead: "Lead perdido",
  assigned_lead: "Lead atribuído",
  linked_channel: "Canal vinculado",
  scheduled_follow_up: "Follow-up agendado",
  converted_customer: "Convertido em cliente",
  replied: "Resposta enviada",
  no_intent: "Mensagem sem intenção comercial",
  completed_task: "Tarefa concluída",
  message_received: "Mensagem recebida",
  availability_check: "Consulta de estoque",
  created_material: "Material cadastrado",
  created_bundle: "Bundle cadastrado",
  created_block: "Bloco cadastrado",
  created_project: "Projeto criado",
  created_quote: "Cotação criada",
  quote_status: "Status da cotação",
  converted_order: "Pedido gerado",
  order_status: "Status do pedido",
  configured_integration: "Integração configurada",
  disconnected_integration: "Integração desconectada",
  created_shipment: "Embarque aberto",
  shipment_status: "Status do embarque",
  reactivation: "Reativação recomendada",
};
