import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";

import { auth } from "@/auth";

export type CurrentUser = {
  id: string;
  name: string | null;
  email: string;
  role: Role;
  organizationId: string;
  sellerId: string | null;
};

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await auth();
  if (!session?.user) return null;
  return {
    id: session.user.id,
    name: session.user.name ?? null,
    email: session.user.email ?? "",
    role: session.user.role,
    organizationId: session.user.organizationId,
    sellerId: session.user.sellerId,
  };
}

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireRole(...roles: Role[]): Promise<CurrentUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) redirect("/dashboard");
  return user;
}
