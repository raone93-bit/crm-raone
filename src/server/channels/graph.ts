/**
 * Cliente mínimo da Meta Graph API.
 * IMPORTANTE (item 11): confira a versão e as rotas na documentação oficial
 * vigente da Meta antes de ligar em produção. As formas de payload abaixo
 * seguem a documentação da Cloud API / Messenger Platform.
 */

export const GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v22.0";
export const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

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
): Promise<any> {
  const res = await fetch(`${GRAPH_BASE}/${path.replace(/^\//, "")}`, {
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

export async function graphGet(path: string, accessToken: string): Promise<any> {
  const sep = path.includes("?") ? "&" : "?";
  const res = await fetch(`${GRAPH_BASE}/${path.replace(/^\//, "")}${sep}access_token=${encodeURIComponent(accessToken)}`);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (json as any)?.error?.message ?? `Graph API respondeu ${res.status}`;
    throw new GraphError(msg, res.status, json);
  }
  return json;
}
