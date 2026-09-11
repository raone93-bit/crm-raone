import Link from "next/link";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { CHANNEL_LABEL, LANGUAGE_LABEL, VERB_LABEL } from "@/lib/labels";
import { formatDateTime, relativeTime } from "@/lib/utils";
import { PageHeader, Card, DataRow, Badge, TemperatureBadge } from "@/components/ui";

export default async function ContactPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();

  const contact = await prisma.contact.findFirst({
    where: { id, organizationId: user.organizationId },
    include: {
      identities: true,
      customer: true,
      companies: { include: { company: true } },
      leads: { include: { stage: true, seller: true }, orderBy: { updatedAt: "desc" } },
      possibleDuplicateOf: true,
    },
  });
  if (!contact) notFound();

  const timeline = await prisma.activity.findMany({
    where: {
      organizationId: user.organizationId,
      OR: [
        { subjectType: "contact", subjectId: contact.id },
        { subjectType: "lead", subjectId: { in: contact.leads.map((l) => l.id) } },
      ],
    },
    orderBy: { createdAt: "desc" },
    include: { actorUser: true },
    take: 40,
  });

  return (
    <div>
      <PageHeader
        title={contact.displayName}
        description={contact.customer ? "Cliente" : "Contato"}
        action={
          <Link href="/clientes" className="btn-ghost">
            ← Clientes
          </Link>
        }
      />

      {contact.possibleDuplicateOf ? (
        <div className="mb-4 rounded-md border border-gold/40 bg-gold/10 px-3 py-2 text-sm text-gold">
          Possível duplicata de{" "}
          <Link href={`/clientes/${contact.possibleDuplicateOf.id}`} className="underline">
            {contact.possibleDuplicateOf.displayName}
          </Link>{" "}
          (confiança {Math.round((contact.duplicateConfidence ?? 0) * 100)}%). Mesclar entra na Fase 2.
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-5">
          <Card>
            <h2 className="mb-3 font-[family-name:var(--font-display)] text-base font-medium">Dados</h2>
            <div className="grid gap-x-8 sm:grid-cols-2">
              <DataRow label="E-mail" value={contact.email} />
              <DataRow label="Telefone" value={contact.phone} />
              <DataRow label="Idioma" value={contact.primaryLanguage ? LANGUAGE_LABEL[contact.primaryLanguage] : null} />
              <DataRow label="País / Cidade" value={[contact.country, contact.city].filter(Boolean).join(" · ") || null} />
              <DataRow label="Empresa" value={contact.companies.map((c) => c.company.name).join(", ") || null} />
              <DataRow label="Criado" value={relativeTime(contact.createdAt)} />
            </div>
          </Card>

          <Card>
            <h2 className="mb-3 font-[family-name:var(--font-display)] text-base font-medium">
              Canais ({contact.identities.length})
            </h2>
            <ul className="flex flex-col gap-2 text-sm">
              {contact.identities.map((i) => (
                <li key={i.id} className="flex items-center justify-between border-b border-line py-2 last:border-0">
                  <span>
                    <Badge>{CHANNEL_LABEL[i.channel] ?? i.channel}</Badge>{" "}
                    {i.handle ?? i.externalId}
                  </span>
                  <span className="text-xs text-ink-soft">{i.verified ? "verificado" : ""}</span>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <h2 className="mb-3 font-[family-name:var(--font-display)] text-base font-medium">
              Leads ({contact.leads.length})
            </h2>
            {contact.leads.length === 0 ? (
              <p className="text-sm text-ink-soft">Nenhum lead.</p>
            ) : (
              <ul className="flex flex-col gap-2 text-sm">
                {contact.leads.map((l) => (
                  <li key={l.id} className="flex items-center justify-between border-b border-line py-2 last:border-0">
                    <Link href={`/leads/${l.id}`} className="hover:text-accent">
                      {l.title ?? "Lead"}
                    </Link>
                    <span className="flex items-center gap-2">
                      <TemperatureBadge value={l.temperature} />
                      <span className="text-xs text-ink-soft">{l.stage.name}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <aside>
          <Card>
            <h2 className="mb-3 font-[family-name:var(--font-display)] text-base font-medium">Timeline</h2>
            {timeline.length === 0 ? (
              <p className="text-sm text-ink-soft">Sem eventos.</p>
            ) : (
              <ol className="flex flex-col gap-3">
                {timeline.map((a) => (
                  <li key={a.id} className="flex gap-2.5 text-sm">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                    <div>
                      <p className="leading-tight">{VERB_LABEL[a.verb] ?? a.verb}</p>
                      {a.summary ? <p className="text-xs text-ink-soft">{a.summary}</p> : null}
                      <p className="text-[11px] text-ink-soft" title={formatDateTime(a.createdAt)}>
                        {relativeTime(a.createdAt)}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </aside>
      </div>
    </div>
  );
}
