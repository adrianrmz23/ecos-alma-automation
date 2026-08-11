"use client";

import { useState, useTransition } from "react";
import { CalendarClock, LoaderCircle, RefreshCw, Rocket, XCircle } from "lucide-react";
import { cancelQueueItem, markPublishNow, retryQueueNow, updateQueueSchedule } from "@/app/(app)/queue/actions";

type QueueItemActionsProps = {
  itemId: string;
  currentLocalDateTime: string;
  status: string;
  facebookConnected?: boolean;
};

export function QueueItemActions({ itemId, currentLocalDateTime, status, facebookConnected = false }: QueueItemActionsProps) {
  const [editing, setEditing] = useState(false);
  const [localDateTime, setLocalDateTime] = useState(currentLocalDateTime);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const editable = status === "scheduled" || status === "ready_to_publish";
  const retryWaiting = status === "retry_wait";
  const actionable = editable || retryWaiting;

  function saveSchedule() {
    setMessage(null);
    startTransition(async () => {
      const result = await updateQueueSchedule({ itemId, localDateTime });
      if (!result.ok) {
        setMessage({ type: "error", text: result.error });
        return;
      }
      setMessage({ type: "success", text: result.message });
      setEditing(false);
    });
  }

  function cancelItem() {
    if (!window.confirm("¿Cancelar esta publicación? Permanecerá en Historial como cancelada.")) return;
    setMessage(null);
    startTransition(async () => {
      const result = await cancelQueueItem(itemId);
      setMessage(result.ok ? { type: "success", text: result.message } : { type: "error", text: result.error });
    });
  }

  function publishNow() {
    if (!facebookConnected) {
      setMessage({ type: "error", text: "Conecta y prueba Facebook desde Configuración antes de publicar." });
      return;
    }

    if (!window.confirm("¿Publicar esta imagen ahora mismo en Facebook?")) return;

    setMessage(null);
    startTransition(async () => {
      const result = await markPublishNow(itemId);
      setMessage(result.ok ? { type: "success", text: result.message } : { type: "error", text: result.error });
    });
  }

  function retryNow() {
    setMessage(null);
    startTransition(async () => {
      const result = await retryQueueNow(itemId);
      setMessage(result.ok ? { type: "success", text: result.message } : { type: "error", text: result.error });
    });
  }

  if (!actionable) return null;

  return (
    <div className="mt-4 border-t border-[#eeeae3] pt-4">
      {editing ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="min-w-0 flex-1">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">Nuevo horario</span>
            <input
              type="datetime-local"
              value={localDateTime}
              onChange={(event) => setLocalDateTime(event.target.value)}
              disabled={isPending}
              className="w-full rounded-[13px] border border-[#e2ddd5] bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-[#baa27f] focus:ring-4 focus:ring-[#f4eee5] disabled:bg-slate-50"
            />
          </label>
          <div className="flex gap-2">
            <button type="button" onClick={saveSchedule} disabled={isPending || !localDateTime} className="rounded-[13px] bg-[#1b241f] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#26312b] disabled:opacity-50">
              {isPending ? "Guardando..." : "Guardar"}
            </button>
            <button type="button" onClick={() => setEditing(false)} disabled={isPending} className="rounded-[13px] border border-[#e2ddd5] bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50">Cancelar</button>
          </div>
        </div>
      ) : retryWaiting ? (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={retryNow} disabled={isPending} className="inline-flex items-center gap-2 rounded-xl border border-[#d5e0e5] bg-[#f1f5f6] px-3 py-2 text-xs font-semibold text-[#55727e] transition hover:bg-[#e8eff1] disabled:opacity-50">
            {isPending ? <LoaderCircle size={14} className="animate-spin" /> : <RefreshCw size={14} />} Reintentar ahora
          </button>
          <button type="button" onClick={cancelItem} disabled={isPending} className="inline-flex items-center gap-2 rounded-xl border border-[#efcece] bg-[#fff5f5] px-3 py-2 text-xs font-semibold text-[#a84d4d] transition hover:bg-[#feeaea] disabled:opacity-50">
            <XCircle size={14} /> Cancelar
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setEditing(true)} disabled={isPending} className="inline-flex items-center gap-2 rounded-[13px] border border-[#e2ddd5] bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50">
            <CalendarClock size={14} /> Cambiar horario
          </button>
          <button
            type="button"
            onClick={publishNow}
            disabled={isPending || !facebookConnected}
            title={facebookConnected ? "Publicar ahora en Facebook" : "Conecta Facebook primero"}
            className="inline-flex items-center gap-2 rounded-[13px] border border-[#e2ddd5] bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isPending ? <LoaderCircle size={14} className="animate-spin" /> : <Rocket size={14} />} Publicar ahora
          </button>
          <button type="button" onClick={cancelItem} disabled={isPending} className="inline-flex items-center gap-2 rounded-xl border border-[#efcece] bg-[#fff5f5] px-3 py-2 text-xs font-semibold text-[#a84d4d] transition hover:bg-[#feeaea] disabled:opacity-50">
            <XCircle size={14} /> Cancelar
          </button>
        </div>
      )}

      {!facebookConnected ? <p className="mt-3 text-xs text-slate-400">Facebook no está conectado; la programación seguirá guardándose normalmente.</p> : null}
      {message ? <p className={`mt-3 text-xs ${message.type === "success" ? "text-emerald-700" : "text-[#a84d4d]"}`}>{message.text}</p> : null}
    </div>
  );
}
