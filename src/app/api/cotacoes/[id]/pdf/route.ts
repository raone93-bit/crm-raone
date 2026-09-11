import { NextResponse } from "next/server";

import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { buildQuotePdf } from "@/server/quotes/pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();

  const quote = await prisma.quote.findFirst({
    where: { id, organizationId: user.organizationId },
    select: { number: true },
  });
  if (!quote) return new NextResponse("Não encontrada", { status: 404 });

  const bytes = await buildQuotePdf(user.organizationId, id);
  if (!bytes) return new NextResponse("Não encontrada", { status: 404 });

  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${quote.number}.pdf"`,
    },
  });
}
