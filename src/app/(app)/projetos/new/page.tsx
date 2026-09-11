import Link from "next/link";

import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import { NewProjectForm } from "./new-project-form";

export const metadata = { title: "Novo projeto" };

export default async function NewProjectPage() {
  const user = await requireUser();
  const [materials, companies] = await Promise.all([
    prisma.material.findMany({
      where: { organizationId: user.organizationId, active: true },
      orderBy: { commercialName: "asc" },
      select: { id: true, commercialName: true },
    }),
    prisma.company.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return (
    <div>
      <PageHeader title="Novo projeto" description="Obra, material previsto, prazo e probabilidade." />
      <NewProjectForm materials={materials} companies={companies} />
      <Link href="/projetos" className="mt-4 inline-block text-sm text-ink-soft hover:text-ink">
        ← Projetos
      </Link>
    </div>
  );
}
