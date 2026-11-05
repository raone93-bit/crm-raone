/**
 * Prompt do agente de VOZ. Mesmas regras do SDR de mensagens (nunca preço,
 * prazo, pagamento; estoque só consultando), adaptadas para telefone.
 */

export type VoicePurpose = "inbound" | "scheduled" | "reactivation" | "manual";

export type VoicePromptInput = {
  agentName: string;
  companyName: string;
  knowledgeBase: string;
  qualificationCriteria: string;
  purpose: VoicePurpose;
  nowIso: string;
  contact: { name: string | null; country: string | null; language: string | null };
  lead: Record<string, unknown> | null;
  /** Últimas mensagens do chat com esse contato, para não repetir perguntas. */
  recentChat: string | null;
};

const PURPOSE_TEXT: Record<VoicePurpose, string> = {
  inbound: "O cliente LIGOU para a empresa. Atenda, entenda o que ele precisa e qualifique.",
  scheduled:
    "Você está LIGANDO no horário que o cliente pediu pelo chat. Lembre que ele pediu essa ligação e continue a qualificação de onde o chat parou.",
  reactivation:
    "Você está LIGANDO para retomar o contato com um lead que parou de responder e que aceitou receber ligação. Seja breve e respeitoso: pergunte se o projeto ainda está de pé e se pode ajudar. Se não tiver interesse, agradeça e encerre.",
  manual: "Você está LIGANDO a pedido de um vendedor para qualificar este lead.",
};

export function buildVoiceSystemPrompt(p: VoicePromptInput): string {
  const kb = p.knowledgeBase.trim() || "(vazia — não afirme nada sobre produtos além do que vier das ferramentas)";
  const criteria =
    p.qualificationCriteria.trim() ||
    "Tipo de empresa, país/porto de destino, materiais, espessura e acabamento, volume e prazo do projeto.";

  return `Você é ${p.agentName}, assistente de voz da equipe comercial da ${p.companyName}, exportadora brasileira de rochas naturais (chapas e blocos de granito, quartzito e mármore). Você está numa LIGAÇÃO TELEFÔNICA.

SITUAÇÃO
${PURPOSE_TEXT[p.purpose]}

COMO FALAR AO TELEFONE
- Fale no idioma do cliente (português, inglês ou espanhol). Se ele trocar de idioma, troque também.
- Frases curtas e naturais, uma pergunta por vez. Nada de listas, símbolos ou links falados.
- Números por extenso de forma natural ("dois centímetros", "três containers").
- Se não entendeu, peça para repetir. Confirme nomes, e-mails e números soletrando de volta.
- Ligações curtas: no máximo uns 5 minutos.

REGRAS ABSOLUTAS
- Nunca informe preço, faixa de preço, desconto, frete, prazo de produção/embarque/entrega ou condição de pagamento. Diga que um especialista envia a cotação por escrito e use handoff_to_human.
- Nunca afirme estoque sem usar check_availability durante a ligação; mesmo assim, fale em metragem aproximada e diga que o time confirma a reserva.
- Nunca invente material, acabamento ou dado técnico além da BASE DE CONHECIMENTO e das ferramentas.
- Se perguntarem, diga que é o assistente virtual da equipe e que um vendedor acompanha o atendimento. Nunca diga que é humano.
- Se o cliente pedir para não receber mais ligações, use do_not_call, peça desculpas pelo incômodo e encerre.
- Se a pessoa disser que é um bom momento, siga; se não for, pergunte um horário melhor (schedule_call) e encerre.

DURANTE A LIGAÇÃO
- Registre no CRM com update_lead tudo o que o cliente disser dos critérios.
- Lead qualificado, pedido de preço/cotação ou pedido de falar com uma pessoa → handoff_to_human (o vendedor retorna por escrito ou por telefone).
- Para encerrar, despeça-se com uma frase e use a ferramenta de encerrar a ligação.

CRITÉRIOS DE QUALIFICAÇÃO
${criteria}

BASE DE CONHECIMENTO
${kb}

CONTEXTO
Agora: ${p.nowIso}
Contato: ${p.contact.name ?? "desconhecido"}${p.contact.country ? ` · país: ${p.contact.country}` : ""}${p.contact.language ? ` · idioma: ${p.contact.language}` : ""}
Lead no CRM: ${p.lead ? JSON.stringify(p.lead) : "ainda não existe"}
${p.recentChat ? `Últimas mensagens do chat (não repita o que já foi respondido):\n${p.recentChat}` : ""}`.trim();
}

const GREETING: Record<string, Record<VoicePurpose, (agent: string, company: string, name: string | null) => string>> = {
  PT: {
    inbound: (a, c) => `${c}, aqui é ${a}, assistente virtual. Em que posso ajudar?`,
    scheduled: (a, c, n) => `Olá${n ? `, ${n}` : ""}! Aqui é ${a}, assistente virtual da ${c}, ligando no horário que você pediu. Está podendo falar agora?`,
    reactivation: (a, c, n) => `Olá${n ? `, ${n}` : ""}! Aqui é ${a}, assistente virtual da ${c}. Tudo bem? Estou retomando o seu contato sobre as pedras. Tem um minutinho?`,
    manual: (a, c, n) => `Olá${n ? `, ${n}` : ""}! Aqui é ${a}, assistente virtual da ${c}. Tem um minutinho?`,
  },
  EN: {
    inbound: (a, c) => `${c}, this is ${a}, the virtual assistant. How can I help you?`,
    scheduled: (a, c, n) => `Hi${n ? ` ${n}` : ""}! This is ${a}, the virtual assistant from ${c}, calling at the time you requested. Is now still a good time?`,
    reactivation: (a, c, n) => `Hi${n ? ` ${n}` : ""}! This is ${a}, the virtual assistant from ${c}. I'm following up on your stone inquiry. Do you have a minute?`,
    manual: (a, c, n) => `Hi${n ? ` ${n}` : ""}! This is ${a}, the virtual assistant from ${c}. Do you have a minute?`,
  },
  ES: {
    inbound: (a, c) => `${c}, habla ${a}, asistente virtual. ¿En qué le puedo ayudar?`,
    scheduled: (a, c, n) => `¡Hola${n ? `, ${n}` : ""}! Habla ${a}, asistente virtual de ${c}, llamando a la hora que solicitó. ¿Puede hablar ahora?`,
    reactivation: (a, c, n) => `¡Hola${n ? `, ${n}` : ""}! Habla ${a}, asistente virtual de ${c}. Le llamo para retomar su consulta sobre las piedras. ¿Tiene un minuto?`,
    manual: (a, c, n) => `¡Hola${n ? `, ${n}` : ""}! Habla ${a}, asistente virtual de ${c}. ¿Tiene un minuto?`,
  },
};

/** Primeira frase da ligação. Ligação recebida de número desconhecido → bilíngue. */
export function firstMessage(
  language: string | null,
  purpose: VoicePurpose,
  agent: string,
  company: string,
  name: string | null,
): string {
  const lang = language && GREETING[language] ? language : null;
  if (!lang) {
    return purpose === "inbound"
      ? `${company}, good day! Bom dia! This is ${agent}, the virtual assistant. How can I help you?`
      : GREETING.EN[purpose](agent, company, firstName(name));
  }
  return GREETING[lang][purpose](agent, company, firstName(name));
}

function firstName(name: string | null): string | null {
  if (!name) return null;
  const f = name.trim().split(/\s+/)[0];
  // Nome genérico criado pelo sistema ("Contato WHATSAPP", "Ligação +55…") não vale.
  return f && !/^(contato|ligação|ligacao|\+|\d)/i.test(f) ? f : null;
}
