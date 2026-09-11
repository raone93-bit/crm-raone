import Link from "next/link";

import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { MATERIAL_TYPE_LABEL } from "@/lib/labels";
import { PageHeader, EmptyState, Badge } from "@/components/ui";

export const metadata = { title: "Produtos" };

export default async function ProdutosPage() {
  const user = await requireUser();
  const materials = await prisma.material.findMany({
    where: { organizationId: user.organizationId },
    include: { _count: { select: { bundles: true, blocks: true } } },
    orderBy: { commercialName: "asc" },
  });

  return (
    <div>
      <PageHeader
        title="Produtos e materiais"
        description="Rochas naturais do catálogo. Blocos, bundles e chapas ficam vinculados a cada material."
        action={
          <Link href="/produtos/new" className="btn-primary">
            Novo material
          </Link>
        }
      />

      {materials.length === 0 ? (
        <EmptyState title="Catálogo vazio" description="Cadastre o primeiro material." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {materials.map((m) => (
            <Link key={m.id} href={`/produtos/${m.id}`} className="card p-4 transition-colors hover:bg-surface-2">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-[family-name:var(--font-display)] font-medium">{m.commercialName}</h3>
                {!m.active ? <Badge tone="iron">inativo</Badge> : null}
              </div>
              <p className="mt-0.5 text-xs text-ink-soft">
                {MATERIAL_TYPE_LABEL[m.type] ?? m.type}
                {m.origin ? ` · ${m.origin}` : ""}
              </p>
              <p className="mt-2 text-xs text-ink-soft">
                {m._count.bundles} bundles · {m._count.blocks} blocos
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
