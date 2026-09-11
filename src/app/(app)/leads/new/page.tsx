import { requireUser } from "@/lib/session";
import { seesAllSellers } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import { NewLeadForm } from "./new-lead-form";

export const metadata = { title: "Novo lead" };

export default async function NewLeadPage() {
  const user = await requireUser();
  const canPick = seesAllSellers(user.role);
  const sellers = canPick
    ? await prisma.seller.findMany({
        where: { organizationId: user.organizationId, active: true, isTriageQueue: false },
        orderBy: { displayName: "asc" },
      })
    : [];

  return (
    <div>
      <PageHeader
        title="Novo lead"
        description="Criação manual. Na Fase 3 os leads chegam automaticamente pelos canais da Meta."
      />
      <NewLeadForm
        sellers={sellers.map((s) => ({ id: s.id, displayName: s.displayName }))}
        canPickSeller={canPick}
      />
    </div>
  );
}
