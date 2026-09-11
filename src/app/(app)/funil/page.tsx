import Link from "next/link";

import { requireUser } from "@/lib/session";
import { seesAllSellers } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { listLeads } from "@/server/leads/queries";
import { PageHeader } from "@/components/ui";
import { Board } from "./board";

export const metadata = { title: "Funil" };

export default async function FunilPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requireUser();
  const sp = await searchParams;

  const [stages, sellers] = await Promise.all([
    prisma.funnelStage.findMany({
      where: { funnel: { organizationId: user.organizationId, isDefault: true } },
      orderBy: { position: "asc" },
    }),
    seesAllSellers(user.role)
      ? prisma.seller.findMany({
          where: { organizationId: user.organizationId, isTriageQueue: false },
          orderBy: { displayName: "asc" },
        })
      : [],
  ]);

  const leads = await listLeads(user, {
    status: "open",
    sellerId: sp.seller,
  });

  return (
    <div>
      <PageHeader
        title="Funil"
        description={
          seesAllSellers(user.role)
            ? "Arraste os leads entre as etapas. Perda exige motivo (na página do lead)."
            : "Seu funil. Arraste os leads entre as etapas."
        }
        action={
          <Link href="/leads/new" className="btn-primary">
            Novo lead
          </Link>
        }
      />

      {seesAllSellers(user.role) && sellers.length > 0 ? (
        <div className="mb-4 flex flex-wrap gap-2 text-xs">
          <Link
            href="/funil"
            className={`rounded-full border px-3 py-1 ${!sp.seller ? "border-accent bg-accent-soft text-accent" : "border-line text-ink-soft"}`}
          >
            Todos
          </Link>
          {sellers.map((s) => (
            <Link
              key={s.id}
              href={`/funil?seller=${s.id}`}
              className={`rounded-full border px-3 py-1 ${sp.seller === s.id ? "border-accent bg-accent-soft text-accent" : "border-line text-ink-soft"}`}
            >
              {s.displayName}
            </Link>
          ))}
        </div>
      ) : null}

      <Board
        stages={stages.map((s) => ({ id: s.id, name: s.name, isWon: s.isWon, isLost: s.isLost }))}
        leads={leads.map((l) => ({
          id: l.id,
          title: l.title ?? l.contact.displayName,
          contactName: l.contact.displayName,
          stageId: l.stageId,
          temperature: l.temperature,
          score: l.score,
          material: l.material?.commercialName ?? l.materialText ?? null,
          seller: seesAllSellers(user.role) ? l.seller?.displayName ?? null : null,
        }))}
      />
    </div>
  );
}
