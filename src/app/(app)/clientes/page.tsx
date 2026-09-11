import Link from "next/link";

import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { CHANNEL_LABEL } from "@/lib/labels";
import { relativeTime } from "@/lib/utils";
import { PageHeader, EmptyState, Badge } from "@/components/ui";

export const metadata = { title: "Clientes" };

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const onlyCustomers = sp.tab === "customers";

  const contacts = await prisma.contact.findMany({
    where: {
      organizationId: user.organizationId,
      ...(onlyCustomers ? { customer: { isNot: null } } : {}),
      ...(sp.q ? { displayName: { contains: sp.q, mode: "insensitive" } } : {}),
    },
    include: {
      identities: true,
      customer: true,
      _count: { select: { leads: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });

  return (
    <div>
      <PageHeader
        title="Clientes e contatos"
        description="Cadastro único por pessoa. Todos os canais (WhatsApp, Instagram, Facebook) apontam para o mesmo contato."
        action={
          <Link href="/clientes/new" className="btn-primary">
            Novo contato
          </Link>
        }
      />

      <div className="mb-4 flex gap-2 text-xs">
        <Link
          href="/clientes"
          className={`rounded-full border px-3 py-1 ${!onlyCustomers ? "border-accent bg-accent-soft text-accent" : "border-line text-ink-soft"}`}
        >
          Todos os contatos
        </Link>
        <Link
          href="/clientes?tab=customers"
          className={`rounded-full border px-3 py-1 ${onlyCustomers ? "border-accent bg-accent-soft text-accent" : "border-line text-ink-soft"}`}
        >
          Somente clientes
        </Link>
      </div>

      {contacts.length === 0 ? (
        <EmptyState title="Nenhum contato" description="Crie um contato ou aguarde a Fase 3, quando eles chegam pelos canais." />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left">
                <th className="px-4 py-3 font-mono text-[11px] uppercase text-ink-soft">Nome</th>
                <th className="px-4 py-3 font-mono text-[11px] uppercase text-ink-soft">Canais</th>
                <th className="px-4 py-3 font-mono text-[11px] uppercase text-ink-soft">País</th>
                <th className="px-4 py-3 font-mono text-[11px] uppercase text-ink-soft">Leads</th>
                <th className="px-4 py-3 font-mono text-[11px] uppercase text-ink-soft">Situação</th>
                <th className="px-4 py-3 font-mono text-[11px] uppercase text-ink-soft">Atualizado</th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((c) => (
                <tr key={c.id} className="border-b border-line last:border-0 hover:bg-surface-2">
                  <td className="px-4 py-3">
                    <Link href={`/clientes/${c.id}`} className="font-medium hover:text-accent">
                      {c.displayName}
                    </Link>
                    {c.possibleDuplicateOfId ? (
                      <div className="text-xs text-gold">possível duplicata</div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-xs text-ink-soft">
                    {[...new Set(c.identities.map((i) => CHANNEL_LABEL[i.channel] ?? i.channel))].join(" · ") || "—"}
                  </td>
                  <td className="px-4 py-3 text-ink-soft">{c.country ?? "—"}</td>
                  <td className="px-4 py-3 tabular-nums">{c._count.leads}</td>
                  <td className="px-4 py-3">
                    {c.customer ? <Badge tone="accent">Cliente</Badge> : <Badge>Contato</Badge>}
                  </td>
                  <td className="px-4 py-3 text-ink-soft">{relativeTime(c.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
