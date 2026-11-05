import { prisma } from "@/lib/prisma";
import { vapiConfigured } from "./config";
import { startCall } from "./vapi";

/**
 * Retorno por ligação de leads parados. Roda no cron diário.
 * Só liga para quem ACEITOU receber ligação (Consent "calls" = true), nunca
 * para quem pediu para parar, no horário comercial do país do cliente, e
 * respeitando o teto diário de ligações. Um mesmo lead recebe no máximo
 * uma ligação de retorno a cada 14 dias.
 */

const COOLDOWN_DAYS = 14;

export type CallReactivationSummary = { orgs: number; candidates: number; queued: number; skipped: Record<string, number> };

export async function runCallReactivation(now = new Date()): Promise<CallReactivationSummary> {
  const summary: CallReactivationSummary = { orgs: 0, candidates: 0, queued: 0, skipped: {} };
  if (!vapiConfigured()) return summary;

  const orgs = await prisma.sdrSettings.findMany({
    where: { voiceEnabled: true, voiceReactivationEnabled: true, vapiPhoneNumberId: { not: null } },
  });

  for (const s of orgs) {
    summary.orgs += 1;
    const staleBefore = new Date(now.getTime() - s.reactivationAfterDays * 24 * 60 * 60 * 1000);
    const cooldown = new Date(now.getTime() - COOLDOWN_DAYS * 24 * 60 * 60 * 1000);

    // Contatos que aceitaram ligação (o filtro final de consentimento é no startCall).
    const consenting = await prisma.consent.findMany({
      where: { organizationId: s.organizationId, purpose: "calls", granted: true },
      select: { contactId: true },
      distinct: ["contactId"],
    });
    if (consenting.length === 0) continue;

    const leads = await prisma.lead.findMany({
      where: {
        organizationId: s.organizationId,
        contactId: { in: consenting.map((c) => c.contactId) },
        wonAt: null,
        lostAt: null,
        temperature: { in: ["WARM", "QUALIFIED", "HOT"] },
        OR: [{ lastContactAt: { lt: staleBefore } }, { lastContactAt: null, updatedAt: { lt: staleBefore } }],
      },
      orderBy: [{ score: "desc" }],
      take: s.maxCallsPerDay * 3,
    });

    for (const lead of leads) {
      summary.candidates += 1;
      const recent = await prisma.activity.count({
        where: {
          organizationId: s.organizationId,
          verb: "call_queued",
          subjectType: "lead",
          subjectId: lead.id,
          createdAt: { gte: cooldown },
        },
      });
      if (recent > 0) {
        summary.skipped["ligou há pouco"] = (summary.skipped["ligou há pouco"] ?? 0) + 1;
        continue;
      }

      const r = await startCall({
        organizationId: s.organizationId,
        contactId: lead.contactId,
        leadId: lead.id,
        purpose: "reactivation",
      }).catch((err: unknown) => ({ ok: false as const, reason: err instanceof Error ? err.message : String(err) }));

      if (r.ok) summary.queued += 1;
      else {
        summary.skipped[r.reason] = (summary.skipped[r.reason] ?? 0) + 1;
        if (r.reason.startsWith("limite de")) break; // teto diário atingido
      }
    }
  }
  return summary;
}
