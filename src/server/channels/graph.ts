/**
 * Cliente mínimo da Meta Graph API.
 * IMPORTANTE (item 11): confira a versão e as rotas na documentação oficial
 * vigente da Meta antes de ligar em produção. As formas de payload abaixo
 * seguem a documentação da Cloud API / Messenger Platform.
 *
 * O Instagram tem DOIS hosts possíveis, dependendo de como a conta foi
 * conectada:
 *   - graph.facebook.com  → contas conectadas via Facebook Login / Página
 *     (tokens que começam com "EAA...").
 *   - graph.instagram.com → contas conectadas via Instagram Login direto
 *     (tokens que começam com "IGAA..." — é o fluxo mais novo da Meta).
 * Confirmado testando na prática: um token "IGAA..." só respondeu em
 * graph.instagram.com — em graph.facebook.com dá "Cannot parse access token".
 */

export const GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v22.0";
export const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;
export const IG_GRAPH_BASE = `https://graph.instagram.com/${GRAPH_VERSION}`;

export type GraphHost = "facebook" | "instagram";

function baseFor(host: GraphHost) {
  return host === "instagram" ? IG_GRAPH_BASE : GRAPH_BASE;
}

export class GraphError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "GraphError";
    this.status = status;
    this.body = body;
  }
}

export async function graphPost(
  path: string,
  accessToken: string,
  body: unknown,
  host: GraphHost = "facebook",
): Promise<any> {
  const res = await fetch(`${baseFor(host)}/${path.replace(/^\//, "")}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      (json as any)?.error?.message ??
      `Graph API respondeu ${res.status}`;
    throw new GraphError(msg, res.status, json);
  }
  return json;
}

export async function graphGet(
  path: string,
  accessToken: string,
  host: GraphHost = "facebook",
): Promise<any> {
  const sep = path.includes("?") ? "&" : "?";
  const res = await fetch(`${baseFor(host)}/${path.replace(/^\//, "")}${sep}access_token=${encodeURIComponent(accessToken)}`);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (json as any)?.error?.message ?? `Graph API respondeu ${res.status}`;
    throw new GraphError(msg, res.status, json);
  }
  return json;
}
