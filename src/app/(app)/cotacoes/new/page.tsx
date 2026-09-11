import Link from "next/link";

import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import { NewQuoteForm } from "./new-quote-form";

export const metadata = { title: "Nova cotação" };

export default async function NewQuotePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requireUser();
  const sp = await searchParams;

  const [customers, projects, lead] = await Promise.all([
    prisma.customer.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.project.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    sp.lead
      ? prisma.lead.findFirst({
          where: { id: sp.lead, organizationId: user.organizationId },
          include: { contact: true },
        })
      : Promise.resolve(null),
  ]);

  return (
    <div>
      <PageHeader
        title="Nova cotação"
        description={lead ? `A partir do lead: ${lead.contact.displayName}` : "Cotação avulsa."}
      />
      <NewQuoteForm
        customers={customers}
        projects={projects}
        leadId={lead?.id ?? null}
        leadLanguage={lead?.language ?? null}
      />
      <Link href="/cotacoes" className="mt-4 inline-block text-sm text-ink-soft hover:text-ink">
        ← Cotações
      </Link>
    </div>
  );
}
