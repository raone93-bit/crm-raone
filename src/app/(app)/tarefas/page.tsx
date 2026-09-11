import Link from "next/link";

import { requireUser } from "@/lib/session";
import { seesAllSellers } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { completeTask } from "@/server/tasks/actions";
import { formatDateTime } from "@/lib/utils";
import { PageHeader, EmptyState, Badge } from "@/components/ui";

export const metadata = { title: "Tarefas" };

const TYPE_LABEL: Record<string, string> = {
  CALL: "Ligar",
  SEND_QUOTE: "Enviar cotação",
  SEND_PHOTOS: "Enviar fotos",
  SEND_VIDEO: "Enviar vídeo",
  CONFIRM_STOCK: "Confirmar estoque",
  CHECK_FREIGHT: "Verificar frete",
  FOLLOW_UP: "Follow-up",
  CONFIRM_PAYMENT: "Confirmar pagamento",
  OTHER: "Tarefa",
};

export default async function TarefasPage() {
  const user = await requireUser();
  const all = seesAllSellers(user.role);

  const tasks = await prisma.task.findMany({
    where: {
      organizationId: user.organizationId,
      status: "OPEN",
      ...(all ? {} : { assigneeUserId: user.id }),
    },
    include: { lead: { include: { contact: true } }, assignee: true },
    orderBy: [{ dueAt: "asc" }],
    take: 200,
  });

  const now = Date.now();
  const overdue = tasks.filter((t) => t.dueAt && t.dueAt.getTime() < now);
  const upcoming = tasks.filter((t) => !t.dueAt || t.dueAt.getTime() >= now);

  function Row({ t }: { t: (typeof tasks)[number] }) {
    return (
      <li className="flex items-center justify-between gap-3 border-b border-line py-3 last:border-0">
        <div>
          <p className="text-sm font-medium">
            <Badge>{TYPE_LABEL[t.type] ?? t.type}</Badge> {t.title}
          </p>
          <p className="text-xs text-ink-soft">
            {t.lead ? (
              <Link href={`/leads/${t.lead.id}`} className="hover:text-accent">
                {t.lead.contact.displayName}
              </Link>
            ) : (
              "—"
            )}
            {t.dueAt ? ` · ${formatDateTime(t.dueAt)}` : ""}
            {all && t.assignee ? ` · ${t.assignee.name ?? t.assignee.email}` : ""}
          </p>
        </div>
        <form action={completeTask}>
          <input type="hidden" name="taskId" value={t.id} />
          <button type="submit" className="btn-ghost text-xs">
            Concluir
          </button>
        </form>
      </li>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Tarefas e follow-ups"
        description={all ? "Todas as tarefas abertas da equipe." : "Suas tarefas abertas."}
      />

      {tasks.length === 0 ? (
        <EmptyState title="Nenhuma tarefa aberta" description="Follow-ups agendados nos leads aparecem aqui." />
      ) : (
        <>
          {overdue.length > 0 ? (
            <div className="card p-5">
              <h2 className="mb-2 font-[family-name:var(--font-display)] text-base font-medium text-gold">
                Atrasadas ({overdue.length})
              </h2>
              <ul>{overdue.map((t) => <Row key={t.id} t={t} />)}</ul>
            </div>
          ) : null}

          <div className="card p-5">
            <h2 className="mb-2 font-[family-name:var(--font-display)] text-base font-medium">
              Próximas ({upcoming.length})
            </h2>
            {upcoming.length === 0 ? (
              <p className="text-sm text-ink-soft">Nada pendente à frente.</p>
            ) : (
              <ul>{upcoming.map((t) => <Row key={t.id} t={t} />)}</ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
