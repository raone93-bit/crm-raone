import type { Role } from "@prisma/client";

import type { CurrentUser } from "@/lib/session";
import { seesAllSellers } from "@/lib/rbac";

/**
 * Todo acesso a dados passa por aqui. `organizationId` é obrigatório em
 * qualquer filtro. Vendedor (não admin/gerente) só enxerga os próprios leads.
 */
export function orgScope(user: CurrentUser) {
  return { organizationId: user.organizationId } as const;
}

export function leadVisibilityWhere(user: CurrentUser) {
  const base = { organizationId: user.organizationId };
  if (seesAllSellers(user.role)) return base;
  // Vendedor: leads onde ele é o vendedor OU o owner.
  return {
    ...base,
    OR: [{ sellerId: user.sellerId ?? "__none__" }, { ownerUserId: user.id }],
  };
}

export function conversationVisibilityWhere(user: CurrentUser) {
  const base = { organizationId: user.organizationId };
  if (seesAllSellers(user.role)) return base;
  return {
    ...base,
    OR: [{ assignedSellerId: user.sellerId ?? "__none__" }, { assignedUserId: user.id }],
  };
}

export function assertRole(user: CurrentUser, ...roles: Role[]) {
  if (!roles.includes(user.role)) {
    throw new Error("Sem permissão para esta ação.");
  }
}
