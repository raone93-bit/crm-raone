import type { Channel } from "@prisma/client";

/**
 * De-duplicação de identidade (item 5).
 * Mesma pessoa falando por Instagram e depois WhatsApp deve virar UM contato.
 * Nunca mescla automaticamente com confiança baixa — só sinaliza.
 */

export type Candidate = {
  contactId: string;
  displayName: string | null;
  phone: string | null; // E.164
  email: string | null;
  country: string | null;
  identities: { channel: Channel; externalId: string; handle: string | null }[];
  lastActivityAt: Date | null;
};

export type Incoming = {
  channel: Channel;
  externalId: string;
  handle?: string | null;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  country?: string | null;
};

export type DedupeMatch = {
  contactId: string;
  confidence: number; // 0..1
  reason: string;
  action: "attach" | "flag" | "none";
};

function normName(s: string | null | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "") // remove diacríticos combinantes
    .replace(/[^a-z ]/g, "")
    .trim();
}

function nameSimilar(a: string, b: string): boolean {
  const na = normName(a);
  const nb = normName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const sa = new Set(na.split(/\s+/));
  const sb = new Set(nb.split(/\s+/));
  let shared = 0;
  for (const t of sa) if (sb.has(t) && t.length > 2) shared += 1;
  return shared >= 1 && (shared / Math.min(sa.size, sb.size)) >= 0.5;
}

export function findDuplicate(incoming: Incoming, candidates: Candidate[]): DedupeMatch {
  let best: DedupeMatch = { contactId: "", confidence: 0, reason: "nenhum", action: "none" };

  for (const c of candidates) {
    // 1. Já tem exatamente esta identidade → é o mesmo contato.
    if (c.identities.some((i) => i.channel === incoming.channel && i.externalId === incoming.externalId)) {
      return { contactId: c.contactId, confidence: 1, reason: "identidade idêntica", action: "attach" };
    }

    let confidence = 0;
    let reason = "";

    // 2. Telefone E.164 idêntico.
    if (incoming.phone && c.phone && incoming.phone === c.phone) {
      confidence = Math.max(confidence, 0.95);
      reason = "telefone idêntico";
    }
    // 3. E-mail idêntico.
    if (incoming.email && c.email && incoming.email.toLowerCase() === c.email.toLowerCase()) {
      confidence = Math.max(confidence, 0.92);
      reason = reason || "e-mail idêntico";
    }
    // 4. Handle idêntico em outro canal (raro, mas forte).
    if (
      incoming.handle &&
      c.identities.some((i) => i.handle && i.handle.toLowerCase() === incoming.handle!.toLowerCase())
    ) {
      confidence = Math.max(confidence, 0.8);
      reason = reason || "mesmo @ em outro canal";
    }
    // 5. Nome muito semelhante + mesmo país + atividade recente.
    if (incoming.name && c.displayName && nameSimilar(incoming.name, c.displayName)) {
      const sameCountry = !!incoming.country && incoming.country === c.country;
      const recent =
        !!c.lastActivityAt && Date.now() - c.lastActivityAt.getTime() < 1000 * 60 * 60 * 24 * 30;
      const n = 0.45 + (sameCountry ? 0.15 : 0) + (recent ? 0.1 : 0);
      if (n > confidence) {
        confidence = n;
        reason = `nome semelhante${sameCountry ? " + país" : ""}${recent ? " + recente" : ""}`;
      }
    }

    if (confidence > best.confidence) {
      best = {
        contactId: c.contactId,
        confidence: Number(confidence.toFixed(2)),
        reason,
        action: confidence >= 0.85 ? "attach" : confidence >= 0.5 ? "flag" : "none",
      };
    }
  }

  return best;
}
