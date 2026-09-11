"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import type { Role } from "@prisma/client";

import { cn } from "@/lib/utils";
import { visibleGroups } from "@/components/nav-items";

export function Sidebar({ role }: { role: Role }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const groups = visibleGroups(role);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="btn-ghost fixed left-3 top-3 z-50 h-9 w-9 p-0 lg:hidden"
        aria-label="Menu"
      >
        {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
      </button>

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-line bg-surface transition-transform lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-14 items-center gap-2 border-b border-line px-5">
          <span className="grid h-6 w-6 place-items-center rounded bg-accent text-xs font-bold text-white">
            R
          </span>
          <span className="font-[family-name:var(--font-display)] text-sm font-medium">
            CRM Raone
          </span>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {groups.map((group) => (
            <div key={group.title} className="mb-5">
              <p className="label px-2 pb-1.5">{group.title}</p>
              <ul className="flex flex-col gap-0.5">
                {group.items.map((item) => {
                  const active =
                    pathname === item.href || pathname.startsWith(`${item.href}/`);
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={() => setOpen(false)}
                        className={cn(
                          "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors",
                          active
                            ? "bg-accent-soft font-medium text-accent"
                            : "text-ink-soft hover:bg-surface-2 hover:text-ink",
                        )}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </aside>

      {open ? (
        <div
          className="fixed inset-0 z-30 bg-black/30 lg:hidden"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      ) : null}
    </>
  );
}
