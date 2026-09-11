import Link from "next/link";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { setProjectStatus } from "@/server/projects/actions";
import { formatDate, formatMoney } from "@/lib/utils";
import { QUOTE_STATUS_LABEL } from "@/lib/labels";
import { PageHeader, Card, DataRow, Badge } from "@/components/ui";

const STATUSES = ["open", "specifying", "quoting", "negotiating", "won", "lost", "on_hold"];
const STATUS_LABEL: Record<string, string> = {
  open: "Aberto",
  specifying: "Especificação",
  quoting: "Cotação",
  negotiating: "Negociação",
  won: "Ganho",
  lost: "Perdido",
  on_hold: "Em espera",
};

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();

  const project = await prisma.project.findFirst({
    where: { id, organizationId: user.organizationId },
    include: {
      material: true,
      company: true,
      contact: true,
      owner: true,
      quotes: { orderBy: { createdAt: "desc" } },
      leads: { include: { stage: true }, orderBy: { updatedAt: "desc" } },
    },
  });
  if (!project) notFound();

  return (
    <div>
      <PageHeader
        title={project.name}
        description={[project.city, project.country].filter(Boolean).join(" · ") || "Projeto"}
        action={
          <Link href="/projetos" className="btn-ghost">
            ← Projetos
          </Link>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
        <Card>
          <form action={setProjectStatus} className="mb-3">
            <input type="hidden" name="projectId" value={project.id} />
            <span className="label">Status</span>
            <select
              name="status"
              defaultValue={project.status}
              className="input mt-1"
              onChange={(e) => e.currentTarget.form?.requestSubmit()}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s] ?? s}
                </option>
              ))}
            </select>
          </form>
          <div className="grid">
            <DataRow label="Empresa" value={project.company?.name} />
            <DataRow label="Contato" value={project.contact?.displayName} />
            <DataRow label="Material" value={project.material?.commercialName} />
            <DataRow label="m² estimado" value={project.squareMeters ? `${project.squareMeters} m²` : null} />
            <DataRow label="Arquiteto" value={project.architect} />
            <DataRow label="Marmoraria" value={project.fabricator} />
            <DataRow label="Prazo" value={project.deadline ? formatDate(project.deadline) : null} />
            <DataRow
              label="Orçamento"
              value={project.budget ? formatMoney(project.budget, project.budgetCurrency ?? "USD") : null}
            />
            <DataRow label="Probabilidade" value={`${project.probability}%`} />
            <DataRow label="Responsável" value={project.owner?.name} />
          </div>
        </Card>

        <div className="flex flex-col gap-5">
          <Card>
            <h2 className="mb-3 font-[family-name:var(--font-display)] text-base font-medium">
              Cotações ({project.quotes.length})
            </h2>
            {project.quotes.length === 0 ? (
              <p className="text-sm text-ink-soft">Nenhuma cotação.</p>
            ) : (
              <ul className="flex flex-col gap-2 text-sm">
                {project.quotes.map((q) => (
                  <li key={q.id} className="flex items-center justify-between border-b border-line py-2 last:border-0">
                    <Link href={`/cotacoes/${q.id}`} className="hover:text-accent">
                      {q.number}
                    </Link>
                    <span className="flex items-center gap-2">
                      <span className="tabular-nums">{formatMoney(q.total, q.currency)}</span>
                      <Badge>{QUOTE_STATUS_LABEL[q.status] ?? q.status}</Badge>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <h2 className="mb-3 font-[family-name:var(--font-display)] text-base font-medium">
              Leads ({project.leads.length})
            </h2>
            {project.leads.length === 0 ? (
              <p className="text-sm text-ink-soft">Nenhum lead vinculado.</p>
            ) : (
              <ul className="flex flex-col gap-2 text-sm">
                {project.leads.map((l) => (
                  <li key={l.id} className="flex items-center justify-between border-b border-line py-2 last:border-0">
                    <Link href={`/leads/${l.id}`} className="hover:text-accent">
                      {l.title ?? "Lead"}
                    </Link>
                    <span className="text-xs text-ink-soft">{l.stage.name}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
