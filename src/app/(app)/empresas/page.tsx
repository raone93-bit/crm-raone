import Link from "next/link";

import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { COMPANY_TYPE_LABEL } from "@/lib/labels";
import { PageHeader, EmptyState } from "@/components/ui";

export const metadata = { title: "Empresas" };

export default async function EmpresasPage() {
  const user = await requireUser();
  const companies = await prisma.company.findMany({
    where: { organizationId: user.organizationId },
    include: { _count: { select: { contacts: true, leads: true } } },
    orderBy: { name: "asc" },
    take: 300,
  });

  return (
    <div>
      <PageHeader
        title="Empresas"
        description="Contas comerciais — importadores, distribuidores, marmorarias, escritórios."
        action={
          <Link href="/empresas/new" className="btn-primary">
            Nova empresa
          </Link>
        }
      />

      {companies.length === 0 ? (
        <EmptyState title="Nenhuma empresa cadastrada" />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left">
                <th className="px-4 py-3 font-mono text-[11px] uppercase text-ink-soft">Nome</th>
                <th className="px-4 py-3 font-mono text-[11px] uppercase text-ink-soft">Tipo</th>
                <th className="px-4 py-3 font-mono text-[11px] uppercase text-ink-soft">País</th>
                <th className="px-4 py-3 font-mono text-[11px] uppercase text-ink-soft">Contatos</th>
                <th className="px-4 py-3 font-mono text-[11px] uppercase text-ink-soft">Leads</th>
              </tr>
            </thead>
            <tbody>
              {companies.map((c) => (
                <tr key={c.id} className="border-b border-line last:border-0 hover:bg-surface-2">
                  <td className="px-4 py-3 font-medium">{c.name}</td>
                  <td className="px-4 py-3 text-ink-soft">
                    {c.type ? COMPANY_TYPE_LABEL[c.type] ?? c.type : "—"}
                  </td>
                  <td className="px-4 py-3 text-ink-soft">{c.country ?? "—"}</td>
                  <td className="px-4 py-3 tabular-nums">{c._count.contacts}</td>
                  <td className="px-4 py-3 tabular-nums">{c._count.leads}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
