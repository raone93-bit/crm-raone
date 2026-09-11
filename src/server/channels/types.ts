import type { Channel } from "@prisma/client";

import type { InboundMessage } from "@/server/conversations/ingest";

export type ParsedInbound = Omit<InboundMessage, "organizationId">;

export type ParsedStatus = {
  externalMessageId: string;
  status: "SENT" | "DELIVERED" | "READ" | "FAILED";
  errorCode?: string;
  errorMessage?: string;
  timestamp?: Date;
};

/** Como localizar a integração dona de um evento (item multi-tenant). */
export type RoutingHint = {
  phoneNumberId?: string;
  pageId?: string;
  igAccountId?: string;
};

export interface ChannelAdapter {
  channel: Channel;

  /** Extrai mensagens de entrada do payload do webhook. */
  parseInbound(payload: unknown): ParsedInbound[];

  /** Extrai atualizações de status (enviado/entregue/lido/falhou). */
  parseStatus(payload: unknown): ParsedStatus[];

  /** De qual conta/número esse payload veio — para achar a Integration. */
  routingHint(payload: unknown): RoutingHint;

  /**
   * Envia uma mensagem de texto. Só funciona com a integração configurada e
   * conectada. `config` traz o token já decifrado e os ids.
   */
  sendText(
    config: SendConfig,
    to: string,
    text: string,
  ): Promise<{ externalId: string }>;
}

export type SendConfig = {
  accessToken: string;
  phoneNumberId?: string;
  pageId?: string;
  igAccountId?: string;
};
