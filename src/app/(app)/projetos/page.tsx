import Link from "next/link";

import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/utils";
import { PageHeader, EmptyState, Badge } from "@/components/ui";

export const metadata = { title: "Projetos" };

export default async function ProjetosPage() {
  const user = await requireUser();
  const projects = await prisma.project.findMany({
    where: { organizationId: user.organizationId },
    include: { material: true, company: true, _count: { select: { quotes: true, leads: true } } },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div>
      <PageHeader
        title="Projetos"
        description="Obras e projetos de arquitetura. Ligam contatos, materiais e cotações."
        action={
          <Link href="/projetos/new" className="btn-primary">
            Novo projeto
          </Link>
        }
      />

      {projects.length === 0 ? (
        <EmptyState title="Nenhum projeto" />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-[11px] uppercase text-ink-soft">
                <th className="px-4 py-3">Projeto</th>
                <th className="px-4 py-3">Local</th>
                <th className="px-4 py-3">Material</th>
                <th className="px-4 py-3">m²</th>
                <th className="px-4 py-3">Prazo</th>
                <th className="px-4 py-3">Prob.</th>
                <th className="px-4 py-3">Cotações</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.id} className="border-b border-line last:border-0 hover:bg-surface-2">
                  <td className="px-4 py-3">
                    <Link href={`/projetos/${p.id}`} className="font-medium hover:text-accent">
                      {p.name}
                    </Link>
                    {p.company ? <div className="text-xs text-ink-soft">{p.company.name}</div> : null}
                  </td>
                  <td className="px-4 py-3 text-ink-soft">
                    {[p.city, p.country].filter(Boolean).join(" · ") || "—"}
                  </td>
                  <td className="px-4 py-3">{p.material?.commercialName ?? "—"}</td>
                  <td className="px-4 py-3 tabular-nums">{p.squareMeters ?? "—"}</td>
                  <td className="px-4 py-3 text-ink-soft">{p.deadline ? formatDate(p.deadline) : "—"}</td>
                  <td className="px-4 py-3">
                    <Badge tone={p.probability >= 60 ? "accent" : p.probability >= 30 ? "gold" : "default"}>
                      {p.probability}%
                    </Badge>
                  </td>
                  <td className="px-4 py-3 tabular-nums">{p._count.quotes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
