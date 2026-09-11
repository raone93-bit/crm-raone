import { LogOut } from "lucide-react";

import { signOut } from "@/auth";
import { initials } from "@/lib/utils";
import type { CurrentUser } from "@/lib/session";

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Administrador",
  MANAGER: "Gerente",
  SELLER: "Vendedor",
  OPERATIONS: "Operacional",
  VIEWER: "Visualização",
};

export function Topbar({ user }: { user: CurrentUser }) {
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-end gap-3 border-b border-line bg-ground/80 px-4 backdrop-blur lg:px-8">
      <div className="flex items-center gap-2.5">
        <div className="grid h-8 w-8 place-items-center rounded-full bg-accent-soft text-xs font-semibold text-accent">
          {initials(user.name ?? user.email)}
        </div>
        <div className="hidden text-right sm:block">
          <p className="text-sm font-medium leading-tight">{user.name ?? user.email}</p>
          <p className="text-[11px] leading-tight text-ink-soft">
            {ROLE_LABEL[user.role] ?? user.role}
          </p>
        </div>
      </div>
      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/login" });
        }}
      >
        <button type="submit" className="btn-ghost h-9 w-9 p-0" aria-label="Sair" title="Sair">
          <LogOut className="h-4 w-4" />
        </button>
      </form>
    </header>
  );
}
