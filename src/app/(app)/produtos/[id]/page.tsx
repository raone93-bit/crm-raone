import Link from "next/link";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/session";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import {
  MATERIAL_TYPE_LABEL,
  FINISH_LABEL,
  QUALITY_LABEL,
  STOCK_STATUS_LABEL,
} from "@/lib/labels";
import { PageHeader, Card, DataRow, Badge } from "@/components/ui";
import { AddBundleForm, AddBlockForm, BundleStatusSelect } from "./stock-forms";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const m = await prisma.material.findFirst({
    where: { id, organizationId: user.organizationId },
    select: { commercialName: true },
  });
  return { title: m?.commercialName ?? "Material" };
}

export default async function MaterialPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const editable = can(user.role, "edit", "product");

  const material = await prisma.material.findFirst({
    where: { id, organizationId: user.organizationId },
    include: {
      bundles: { orderBy: { bundleNumber: "asc" } },
      blocks: { orderBy: { blockNumber: "asc" } },
    },
  });
  if (!material) notFound();

  const availableSqm = material.bundles
    .filter((b) => b.status === "AVAILABLE")
    .reduce((s, b) => s + (b.squareMeters ?? 0), 0);

  return (
    <div>
      <PageHeader
        title={material.commercialName}
        description={`${MATERIAL_TYPE_LABEL[material.type] ?? material.type}${material.technicalName ? ` · ${material.technicalName}` : ""}`}
        action={
          <Link href="/produtos" className="btn-ghost">
            ← Produtos
          </Link>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
        <Card>
          <div className="grid">
            <DataRow label="Tipo" value={MATERIAL_TYPE_LABEL[material.type] ?? material.type} />
            <DataRow label="Nome técnico" value={material.technicalName} />
            <DataRow label="Cor" value={material.color} />
            <DataRow label="Origem" value={material.origin} />
            <DataRow label="Pedreira" value={material.quarry} />
            <DataRow label="Código" value={material.code} />
            <DataRow label="Bundles" value={material.bundles.length} />
            <DataRow label="m² disponível" value={`${Math.round(availableSqm)} m²`} />
          </div>
          {material.description ? (
            <p className="mt-3 text-sm text-ink-soft">{material.description}</p>
          ) : null}
        </Card>

        <div className="flex flex-col gap-5">
          <Card>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-[family-name:var(--font-display)] text-base font-medium">
                Bundles ({material.bundles.length})
              </h2>
              {editable ? <AddBundleForm materialId={material.id} /> : null}
            </div>
            {material.bundles.length === 0 ? (
              <p className="text-sm text-ink-soft">Nenhum bundle.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-[11px] uppercase text-ink-soft">
                      <th className="py-2 pr-3">Bundle</th>
                      <th className="py-2 pr-3">Esp.</th>
                      <th className="py-2 pr-3">Acab.</th>
                      <th className="py-2 pr-3">Chapas</th>
                      <th className="py-2 pr-3">m²</th>
                      <th className="py-2 pr-3">Local</th>
                      <th className="py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {material.bundles.map((b) => (
                      <tr key={b.id} className="border-b border-line last:border-0">
                        <td className="py-2 pr-3 font-medium">{b.bundleNumber}</td>
                        <td className="py-2 pr-3">{b.thicknessCm ? `${b.thicknessCm} cm` : "—"}</td>
                        <td className="py-2 pr-3">{b.finish ? FINISH_LABEL[b.finish] ?? b.finish : "—"}</td>
                        <td className="py-2 pr-3 tabular-nums">{b.slabCount}</td>
                        <td className="py-2 pr-3 tabular-nums">{b.squareMeters ?? "—"}</td>
                        <td className="py-2 pr-3 text-ink-soft">{b.location ?? "—"}</td>
                        <td className="py-2">
                          {editable ? (
                            <BundleStatusSelect bundleId={b.id} status={b.status} />
                          ) : (
                            <Badge>{STOCK_STATUS_LABEL[b.status] ?? b.status}</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-[family-name:var(--font-display)] text-base font-medium">
                Blocos ({material.blocks.length})
              </h2>
              {editable ? <AddBlockForm materialId={material.id} /> : null}
            </div>
            {material.blocks.length === 0 ? (
              <p className="text-sm text-ink-soft">Nenhum bloco.</p>
            ) : (
              <ul className="flex flex-col gap-1.5 text-sm">
                {material.blocks.map((bl) => (
                  <li key={bl.id} className="flex justify-between border-b border-line py-1.5 last:border-0">
                    <span className="font-medium">{bl.blockNumber}</span>
                    <span className="text-ink-soft">
                      {bl.volumeM3 ? `${bl.volumeM3.toFixed(2)} m³` : ""}
                      {bl.quality ? ` · ${QUALITY_LABEL[bl.quality] ?? bl.quality}` : ""}
                      {` · ${STOCK_STATUS_LABEL[bl.status] ?? bl.status}`}
                    </span>
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
