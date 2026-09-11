import { prisma } from "@/lib/prisma";
import type { CurrentUser } from "@/lib/session";

/** Registro de auditoria (item 46) + linha na timeline (item 35). */
export async function record(
  user: CurrentUser,
  params: {
    action: string;
    entity: string;
    entityId: string;
    before?: unknown;
    after?: unknown;
    verb?: string;
    subjectType?: string;
    subjectId?: string;
    summary?: string;
  },
) {
  const {
    action,
    entity,
    entityId,
    before,
    after,
    verb = action,
    subjectType = entity,
    subjectId = entityId,
    summary,
  } = params;

  await prisma.$transaction([
    prisma.auditLog.create({
      data: {
        organizationId: user.organizationId,
        actorUserId: user.id,
        action,
        entity,
        entityId,
        before: before === undefined ? undefined : (before as object),
        after: after === undefined ? undefined : (after as object),
      },
    }),
    prisma.activity.create({
      data: {
        organizationId: user.organizationId,
        actorType: "USER",
        actorUserId: user.id,
        verb,
        subjectType,
        subjectId,
        summary,
      },
    }),
  ]);
}
