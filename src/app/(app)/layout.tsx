import { requireUser } from "@/lib/session";
import { Sidebar } from "@/components/sidebar";
import { Topbar } from "@/components/topbar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  return (
    <div className="min-h-screen">
      <Sidebar role={user.role} />
      <div className="lg:pl-60">
        <Topbar user={user} />
        <main className="p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
