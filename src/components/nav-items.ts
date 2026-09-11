import {
  LayoutDashboard,
  MessagesSquare,
  Target,
  Users,
  Building2,
  Filter,
  UserCog,
  Boxes,
  Warehouse,
  FolderKanban,
  FileText,
  ShoppingCart,
  Ship,
  CheckSquare,
  BarChart3,
  Plug,
  Settings,
  type LucideIcon,
} from "lucide-react";

import type { Role } from "@prisma/client";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  roles?: Role[]; // se ausente, todos veem
};

export const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "Comercial",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/conversas", label: "Conversas", icon: MessagesSquare },
      { href: "/leads", label: "Leads", icon: Target },
      { href: "/clientes", label: "Clientes", icon: Users },
      { href: "/empresas", label: "Empresas", icon: Building2 },
      { href: "/funil", label: "Funil", icon: Filter },
      {
        href: "/vendedores",
        label: "Vendedores",
        icon: UserCog,
        roles: ["ADMIN", "MANAGER"],
      },
    ],
  },
  {
    title: "Catálogo",
    items: [
      { href: "/produtos", label: "Produtos", icon: Boxes },
      { href: "/estoque", label: "Estoque", icon: Warehouse },
      { href: "/projetos", label: "Projetos", icon: FolderKanban },
      { href: "/cotacoes", label: "Cotações", icon: FileText },
      { href: "/pedidos", label: "Pedidos", icon: ShoppingCart },
      { href: "/exportacao", label: "Exportação", icon: Ship },
    ],
  },
  {
    title: "Gestão",
    items: [
      { href: "/tarefas", label: "Tarefas", icon: CheckSquare },
      { href: "/relatorios", label: "Relatórios", icon: BarChart3 },
      {
        href: "/integracoes",
        label: "Integrações",
        icon: Plug,
        roles: ["ADMIN"],
      },
      {
        href: "/configuracoes",
        label: "Configurações",
        icon: Settings,
        roles: ["ADMIN"],
      },
    ],
  },
];

export function visibleGroups(role: Role) {
  return NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((i) => !i.roles || i.roles.includes(role)),
  })).filter((g) => g.items.length > 0);
}
