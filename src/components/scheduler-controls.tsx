"use client";

import { useState, useTransition } from "react";
import { Activity, Play, RefreshCw } from "lucide-react";
import { runSchedulerForCurrentUser } from "@/app/(app)/queue/actions";

export function SchedulerControls({
  dueCount,
  readyCount,
  retryCount,
  facebookConnected,
  healthLabel,
  lastTickLabel,
}: {
  dueCount: number;
  readyCount: number;
  retryCount: number;
  facebookConnected: boolean;
  healthLabel: string;
  lastTickLabel: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState("");

  function runNow() {
    setMessage("");
    startTransition(async () => {
      const result = await runSchedulerForCurrentUser();
      setMessage(result.ok ? result.message : result.error);
    });
  }

  return (
    <section className="surface-card mb-6 p-5 sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Activity size={16} className="text-[#5f7f69]" />
            <p className="text-sm font-semibold text-[#19221d]">Scheduler + Facebook</p>
          </div>
          <p className="mt-1 text-sm leading-6 text-[#737b75]">
            Detecta publicaciones vencidas, libera reintentos seguros y {facebookConnected ? "las publica en Facebook." : "las conserva hasta que Facebook vuelva a estar conectado."}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-full bg-[#fbf3e6] px-3 py-1 text-xs font-semibold text-[#a77335]">Vencidas: {dueCount}</span>
            <span className="rounded-full bg-[#eef3f5] px-3 py-1 text-xs font-semibold text-[#55727e]">Listas: {readyCount}</span>
            <span className="rounded-full bg-[#f2eff7] px-3 py-1 text-xs font-semibold text-[#74678a]">Reintentos: {retryCount}</span>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${facebookConnected ? "bg-[#edf4ef] text-[#557460]" : "bg-slate-100 text-[#737b75]"}`}>
              Facebook: {facebookConnected ? "conectado" : "pendiente"}
            </span>
            <span className="rounded-full bg-[#f1efeb] px-3 py-1 text-xs font-semibold text-[#6f7771]">Scheduler: {healthLabel}</span>
          </div>
          <p className="mt-2 text-[11px] text-slate-400">Último ciclo: {lastTickLabel}</p>
        </div>
        <button type="button" onClick={runNow} disabled={isPending} className="inline-flex items-center justify-center gap-2 rounded-[16px] bg-[#1b241f] px-5 py-3 text-sm font-semibold text-white shadow-[0_10px_25px_rgba(27,36,31,0.10)] transition hover:-translate-y-0.5 hover:bg-[#26312b] disabled:opacity-50">
          {isPending ? <RefreshCw size={16} className="animate-spin" /> : <Play size={16} />} Ejecutar ciclo ahora
        </button>
      </div>
      {message ? <p className="mt-3 text-xs text-slate-600">{message}</p> : null}
    </section>
  );
}
