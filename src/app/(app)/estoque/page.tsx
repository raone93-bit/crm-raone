import Link from "next/link";

import { requireUser } from "@/lib/session";
import { getInventory, checkAvailability } from "@/server/catalog/availability";
import { FINISH_LABEL } from "@/lib/labels";
import { PageHeader, Card, EmptyState } from "@/components/ui";

export const metadata = { title: "Estoque" };

export default async function EstoquePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requireUser();
  const sp = await searchParams;

  const inventory = await getInventory(user.organizationId);

  const query = sp.material
    ? await checkAvailability({
        organizationId: user.organizationId,
        material: sp.material,
        thicknessCm: sp.thickness ? Number(sp.thickness) : undefined,
      })
    : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Estoque"
        description="Bundles agregados por material, espessura e acabamento. A mesma consulta que a IA usa para responder disponibilidade."
      />

      <Card>
        <h2 className="mb-3 font-[family-name:var(--font-display)] text-base font-medium">
          Consulta de disponibilidade
        </h2>
        <form className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs">
            <span className="label">Material</span>
            <input name="material" defaultValue={sp.material ?? ""} className="input w-52" placeholder="Taj Mahal" />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="label">Espessura (cm)</span>
            <input name="thickness" defaultValue={sp.thickness ?? ""} className="input w-28" placeholder="3" />
          </label>
          <button type="submit" className="btn-primary">
            Verificar
          </button>
        </form>
        {query ? (
          <div
            className={`mt-4 rounded-md border px-3 py-2 text-sm ${
              query.found ? "border-accent/40 bg-accent/10 text-accent" : "border-gold/40 bg-gold/10 text-gold"
            }`}
          >
            <p className="font-medium">{query.note}</p>
            {query.bundles.length > 0 ? (
              <ul className="mt-1 text-xs text-ink">
                {query.bundles.map((b) => (
                  <li key={b.bundleNumber}>
                    {b.bundleNumber} — {b.thicknessCm ? `${b.thicknessCm} cm` : "?"}
                    {b.finish ? ` ${FINISH_LABEL[b.finish] ?? b.finish}` : ""} · {b.squareMeters ?? "?"} m² · {b.location ?? "—"}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </Card>

      {inventory.length === 0 ? (
        <EmptyState title="Sem bundles cadastrados" description="Cadastre bundles em cada material." />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-[11px] uppercase text-ink-soft">
                <th className="px-4 py-3">Material</th>
                <th className="px-4 py-3">Espessura</th>
                <th className="px-4 py-3">Acabamento</th>
                <th className="px-4 py-3">Bundles</th>
                <th className="px-4 py-3">Disponíveis</th>
                <th className="px-4 py-3">Reservados</th>
                <th className="px-4 py-3">m² total</th>
              </tr>
            </thead>
            <tbody>
              {inventory.map((g, i) => (
                <tr key={i} className="border-b border-line last:border-0">
                  <td className="px-4 py-3">
                    <Link href={`/produtos/${g.materialId}`} className="font-medium hover:text-accent">
                      {g.material}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{g.thicknessCm ? `${g.thicknessCm} cm` : "—"}</td>
                  <td className="px-4 py-3">{g.finish ? FINISH_LABEL[g.finish] ?? g.finish : "—"}</td>
                  <td className="px-4 py-3 tabular-nums">{g.bundleCount}</td>
                  <td className="px-4 py-3 tabular-nums text-accent">{g.available}</td>
                  <td className="px-4 py-3 tabular-nums text-gold">{g.reserved}</td>
                  <td className="px-4 py-3 tabular-nums">{g.sqm}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
