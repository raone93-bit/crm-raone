"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

const schema = z.object({ taskId: z.string() });

export async function completeTask(formData: FormData) {
  const user = await requireUser();
  const { taskId } = schema.parse(Object.fromEntries(formData));

  const task = await prisma.task.findFirst({
    where: { id: taskId, organizationId: user.organizationId },
  });
  if (!task) throw new Error("Tarefa não encontrada.");

  await prisma.task.update({
    where: { id: task.id },
    data: { status: "DONE", completedAt: new Date() },
  });

  if (task.leadId) {
    await prisma.followUp.updateMany({
      where: { leadId: task.leadId, status: "OPEN", reason: task.title },
      data: { status: "DONE", completedAt: new Date() },
    });
  }

  await prisma.activity.create({
    data: {
      organizationId: user.organizationId,
      actorType: "USER",
      actorUserId: user.id,
      verb: "completed_task",
      subjectType: task.leadId ? "lead" : "task",
      subjectId: task.leadId ?? task.id,
      summary: `Tarefa concluída: ${task.title}`,
    },
  });

  revalidatePath("/tarefas");
  revalidatePath("/dashboard");
}
