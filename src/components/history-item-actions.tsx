"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, LoaderCircle, RefreshCw, XCircle } from "lucide-react";
import { cancelHistoryItem, markHistoryItemPublished, retryHistoryItem } from "@/app/(app)/library/actions";

export function HistoryItemActions({ itemId, status }: { itemId: string; status: string }) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  if (!["failed", "needs_review"].includes(status)) return null;

  function retry() {
    const needsReview = status === "needs_review";
    if (needsReview) {
      const confirmed = window.confirm(
        "Antes de reintentar, revisa la Página de Facebook.\n\n¿Confirmas que esta imagen NO se publicó en Facebook?",
      );
      if (!confirmed) return;
    }

    setMessage(null);
    startTransition(async () => {
      const result = await retryHistoryItem({ itemId, confirmedNotPublished: needsReview });
      setMessage(result.ok ? { type: "ok", text: result.message } : { type: "error", text: result.error });
    });
  }

  function markPublished() {
    if (!window.confirm("¿Verificaste personalmente que esta imagen SÍ aparece publicada en Facebook?")) return;
    setMessage(null);
    startTransition(async () => {
      const result = await markHistoryItemPublished(itemId);
      setMessage(result.ok ? { type: "ok", text: result.message } : { type: "error", text: result.error });
    });
  }

  function cancel() {
    if (!window.confirm("¿Archivar esta publicación como cancelada?")) return;
    setMessage(null);
    startTransition(async () => {
      const result = await cancelHistoryItem(itemId);
      setMessage(result.ok ? { type: "ok", text: result.message } : { type: "error", text: result.error });
    });
  }

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      <button type="button" onClick={retry} disabled={isPending} className="inline-flex items-center gap-1.5 rounded-[13px] border border-[#d5e0e5] bg-[#f1f5f6] px-3 py-2 text-xs font-semibold text-[#55727e] transition hover:bg-[#e8eff1] disabled:opacity-50">
        {isPending ? <LoaderCircle size={13} className="animate-spin" /> : <RefreshCw size={13} />} Reintentar
      </button>
      {status === "needs_review" ? (
        <button type="button" onClick={markPublished} disabled={isPending} className="inline-flex items-center gap-1.5 rounded-xl border border-[#d8e7dc] bg-[#f0f6f2] px-3 py-2 text-xs font-semibold text-[#52725e] transition hover:bg-[#e7f1ea] disabled:opacity-50">
          <CheckCircle2 size={13} /> Sí se publicó
        </button>
      ) : null}
      <button type="button" onClick={cancel} disabled={isPending} className="inline-flex items-center gap-1.5 rounded-xl border border-[#efcece] bg-[#fff5f5] px-3 py-2 text-xs font-semibold text-[#a84d4d] transition hover:bg-[#feeaea] disabled:opacity-50">
        <XCircle size={13} /> Cancelar
      </button>
      {message ? <p className={`w-full text-xs ${message.type === "ok" ? "text-[#52725e]" : "text-[#a84d4d]"}`}>{message.text}</p> : null}
    </div>
  );
}
