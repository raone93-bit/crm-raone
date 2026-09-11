"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";

import { moveLeadStageById } from "@/server/leads/actions";

export type BoardLead = {
  id: string;
  title: string;
  contactName: string;
  stageId: string;
  temperature: string;
  score: number;
  material: string | null;
  seller: string | null;
};

export type BoardStage = { id: string; name: string; isWon: boolean; isLost: boolean };

const TEMP_DOT: Record<string, string> = {
  HOT: "bg-iron",
  QUALIFIED: "bg-accent",
  WARM: "bg-gold",
  COLD: "bg-line",
};

function Card({ lead }: { lead: BoardLead }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: lead.id });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`card cursor-grab p-3 active:cursor-grabbing ${isDragging ? "opacity-40" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="line-clamp-2 text-sm font-medium">{lead.title}</span>
        <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${TEMP_DOT[lead.temperature] ?? "bg-line"}`} />
      </div>
      <p className="mt-1 text-xs text-ink-soft">{lead.contactName}</p>
      <div className="mt-2 flex items-center justify-between text-[11px] text-ink-soft">
        <span>{lead.material ?? "sem material"}</span>
        <span className="tabular-nums">{lead.score}</span>
      </div>
      {lead.seller ? <p className="mt-1 text-[11px] text-ink-soft">{lead.seller}</p> : null}
      <Link
        href={`/leads/${lead.id}`}
        className="mt-2 block text-[11px] text-accent hover:underline"
        onClick={(e) => e.stopPropagation()}
      >
        Abrir
      </Link>
    </div>
  );
}

function Column({
  stage,
  leads,
  disabled,
}: {
  stage: BoardStage;
  leads: BoardLead[];
  disabled: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id, disabled });
  return (
    <div className="flex w-72 shrink-0 flex-col">
      <div className="mb-2 flex items-center justify-between px-1">
        <span
          className={`text-xs font-medium ${
            stage.isWon ? "text-accent" : stage.isLost ? "text-iron" : "text-ink"
          }`}
        >
          {stage.name}
        </span>
        <span className="font-mono text-[11px] text-ink-soft">{leads.length}</span>
      </div>
      <div
        ref={setNodeRef}
        className={`flex min-h-24 flex-1 flex-col gap-2 rounded-lg border border-dashed p-2 transition-colors ${
          isOver && !disabled ? "border-accent bg-accent-soft" : "border-line bg-surface/40"
        }`}
      >
        {disabled ? (
          <p className="px-1 py-2 text-[11px] text-ink-soft">
            Use “Marcar perdido” na página do lead (exige motivo).
          </p>
        ) : null}
        {leads.map((l) => (
          <Card key={l.id} lead={l} />
        ))}
      </div>
    </div>
  );
}

export function Board({
  stages,
  leads: initialLeads,
}: {
  stages: BoardStage[];
  leads: BoardLead[];
}) {
  const [leads, setLeads] = useState(initialLeads);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const leadId = String(e.active.id);
    const toStageId = e.over ? String(e.over.id) : null;
    if (!toStageId) return;

    const lead = leads.find((l) => l.id === leadId);
    if (!lead || lead.stageId === toStageId) return;

    const prev = leads;
    setLeads((ls) => ls.map((l) => (l.id === leadId ? { ...l, stageId: toStageId } : l)));
    setError(null);

    startTransition(async () => {
      try {
        await moveLeadStageById(leadId, toStageId);
        router.refresh();
      } catch (err) {
        setLeads(prev);
        setError(err instanceof Error ? err.message : "Falha ao mover o lead.");
      }
    });
  }

  const active = leads.find((l) => l.id === activeId) ?? null;

  return (
    <div>
      {error ? (
        <p className="mb-3 rounded-md border border-iron/40 bg-iron/10 px-3 py-2 text-sm text-iron">
          {error}
        </p>
      ) : null}
      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4">
          {stages.map((s) => (
            <Column
              key={s.id}
              stage={s}
              disabled={s.isLost}
              leads={leads.filter((l) => l.stageId === s.id)}
            />
          ))}
        </div>
        <DragOverlay>{active ? <Card lead={active} /> : null}</DragOverlay>
      </DndContext>
    </div>
  );
}
