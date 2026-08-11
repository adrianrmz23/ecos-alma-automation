"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Check, ImagePlus, LoaderCircle, Trash2, UploadCloud } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { saveBulkSchedule } from "@/app/(app)/bulk-schedule/actions";

type SuggestedSlot = {
  iso: string;
  displayDate: string;
  displayTime: string;
};

type BulkScheduleUploaderProps = {
  suggestedSlots: SuggestedSlot[];
  intervalMinutes: number;
  windowLabel: string;
};

type LocalItem = {
  id: string;
  file: File;
  previewUrl: string;
  caption: string;
  status: "ready" | "uploading" | "uploaded" | "scheduled" | "error";
  error?: string;
};

type SuccessItem = {
  id: string;
  filename: string;
  scheduledFor: string;
  displayDate: string;
  displayTime: string;
};

const MAX_FILES = 10;
const MAX_FILE_BYTES = 15 * 1024 * 1024;
const ACCEPTED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export function BulkScheduleUploader({ suggestedSlots, intervalMinutes, windowLabel }: BulkScheduleUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const itemsRef = useRef<LocalItem[]>([]);
  const [items, setItems] = useState<LocalItem[]>([]);
  const [showCaptions, setShowCaptions] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [globalError, setGlobalError] = useState("");
  const [successItems, setSuccessItems] = useState<SuccessItem[]>([]);
  const [completedUploads, setCompletedUploads] = useState(0);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    return () => {
      itemsRef.current.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    };
  }, []);

  const progressPercent = useMemo(() => {
    if (items.length === 0) return 0;
    if (successItems.length > 0) return 100;
    return Math.round((completedUploads / items.length) * 100);
  }, [completedUploads, items.length, successItems.length]);

  function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0 || isSubmitting) return;
    setGlobalError("");
    setSuccessItems([]);

    const remaining = MAX_FILES - items.length;
    if (remaining <= 0) {
      setGlobalError("Ya tienes 10 imágenes. Elimina alguna para agregar otra.");
      return;
    }

    const selected = Array.from(fileList).slice(0, remaining);
    const next: LocalItem[] = [];
    const invalid: string[] = [];

    for (const file of selected) {
      if (!ACCEPTED_TYPES.has(file.type)) {
        invalid.push(`${file.name}: formato no permitido`);
        continue;
      }
      if (file.size > MAX_FILE_BYTES) {
        invalid.push(`${file.name}: supera 15 MB`);
        continue;
      }

      next.push({
        id: crypto.randomUUID(),
        file,
        previewUrl: URL.createObjectURL(file),
        caption: "",
        status: "ready",
      });
    }

    if (invalid.length > 0) setGlobalError(invalid.join(" · "));
    if (fileList.length > remaining) {
      setGlobalError((previous) => `${previous ? `${previous} · ` : ""}Solo agregamos las primeras ${remaining} imágenes para respetar el máximo de 10.`);
    }

    setItems((current) => [...current, ...next]);
    if (inputRef.current) inputRef.current.value = "";
  }

  function removeItem(id: string) {
    setItems((current) => {
      const target = current.find((item) => item.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return current.filter((item) => item.id !== id);
    });
  }

  function moveItem(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    setItems((current) => {
      const copy = [...current];
      [copy[index], copy[target]] = [copy[target], copy[index]];
      return copy;
    });
  }

  function updateCaption(id: string, caption: string) {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, caption } : item)));
  }

  async function handleSchedule() {
    if (items.length === 0 || isSubmitting) return;

    setIsSubmitting(true);
    setGlobalError("");
    setSuccessItems([]);
    setCompletedUploads(0);
    setItems((current) => current.map((item) => ({ ...item, status: "ready", error: undefined })));

    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      setGlobalError("Tu sesión expiró. Recarga la página e inicia sesión de nuevo.");
      setIsSubmitting(false);
      return;
    }

    const batchId = crypto.randomUUID();
    const uploadedPaths: string[] = [];
    const uploadedItems: Array<{ storagePath: string; originalFilename: string; mimeType: string; caption: string }> = [];

    try {
      for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        setItems((current) => current.map((entry) => (entry.id === item.id ? { ...entry, status: "uploading" } : entry)));

        const extension = extensionFor(item.file);
        const storagePath = `${user.id}/bulk/${batchId}/${String(index + 1).padStart(2, "0")}-${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await supabase.storage.from("generated-post-images").upload(storagePath, item.file, {
          contentType: item.file.type,
          upsert: false,
        });

        if (uploadError) throw new Error(`No pudimos subir ${item.file.name}: ${uploadError.message}`);

        uploadedPaths.push(storagePath);
        uploadedItems.push({
          storagePath,
          originalFilename: item.file.name,
          mimeType: item.file.type,
          caption: item.caption,
        });

        setCompletedUploads(index + 1);
        setItems((current) => current.map((entry) => (entry.id === item.id ? { ...entry, status: "uploaded" } : entry)));
      }

      const result = await saveBulkSchedule({ batchId, items: uploadedItems });
      if (!result.ok) throw new Error(result.error);

      setSuccessItems(result.scheduled);
      setItems((current) => current.map((item) => ({ ...item, status: "scheduled" })));
    } catch (error) {
      const message = error instanceof Error ? error.message : "No pudimos completar la programación masiva.";
      setGlobalError(message);
      if (uploadedPaths.length > 0) {
        await supabase.storage.from("generated-post-images").remove(uploadedPaths);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  function resetBatch() {
    items.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    setItems([]);
    setSuccessItems([]);
    setGlobalError("");
    setCompletedUploads(0);
    setShowCaptions(false);
  }

  return (
    <div className="space-y-6">
      <section className="surface-card p-6 sm:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-lg font-semibold text-slate-950">Selecciona tus imágenes</p>
            <p className="mt-1 text-sm leading-6 text-slate-500">PNG, JPG o WEBP · máximo 10 por carga · 15 MB por archivo.</p>
          </div>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={items.length >= MAX_FILES || isSubmitting}
            className="inline-flex items-center justify-center gap-2 rounded-[16px] bg-[#1b241f] px-5 py-3 text-sm font-semibold text-white shadow-[0_10px_25px_rgba(27,36,31,0.10)] transition hover:-translate-y-0.5 hover:bg-[#26312b] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ImagePlus size={17} /> Seleccionar imágenes
          </button>
          <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" multiple className="hidden" onChange={(event) => handleFiles(event.target.files)} />
        </div>

        <button
          type="button"
          onClick={() => setShowCaptions((value) => !value)}
          className="mt-5 text-sm font-medium text-slate-500 underline decoration-slate-300 underline-offset-4 hover:text-slate-900"
        >
          {showCaptions ? "Ocultar texto opcional" : "Agregar texto opcional a alguna publicación"}
        </button>
      </section>

      {globalError ? <div className="rounded-[18px] border border-[#efcaca] bg-[#fff6f6] px-4 py-3 text-sm text-[#a84949]">{globalError}</div> : null}

      {items.length === 0 ? (
        <section
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            handleFiles(event.dataTransfer.files);
          }}
          className="flex min-h-80 flex-col items-center justify-center rounded-[28px] border border-dashed border-[#d9d1c5] bg-white/70 px-6 text-center shadow-[inset_0_0_0_1px_rgba(255,255,255,0.5)] transition hover:border-[#c7b293] hover:bg-white"
        >
          <div className="rounded-[16px] bg-[#f4eee5] p-3 text-[#9b713e]"><UploadCloud size={24} /></div>
          <h2 className="mt-5 text-lg font-semibold text-slate-950">Suelta aquí tu próximo lote</h2>
          <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">Puedes arrastrar o seleccionar archivos. Después podrás revisar el orden y los horarios antes de confirmar.</p>
        </section>
      ) : (
        <section className="surface-card p-5 sm:p-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-lg font-semibold text-slate-950">Vista previa del lote</p>
              <p className="mt-1 text-sm text-slate-500">{items.length} de {MAX_FILES} imágenes seleccionadas.</p>
            </div>
            {!isSubmitting && successItems.length === 0 ? <p className="text-xs font-medium text-slate-400">Usa ↑ ↓ para cambiar el orden</p> : null}
          </div>

          <div className="mt-5 space-y-3">
            {items.map((item, index) => {
              const slot = suggestedSlots[index];
              return (
                <article key={item.id} className="grid gap-4 rounded-[22px] border border-[#e9e4dc] bg-[#fcfbf8] p-4 transition hover:border-[#ddd4c8] md:grid-cols-[92px_minmax(0,1fr)_auto] md:items-center">
                  <div className="h-24 w-24 overflow-hidden rounded-2xl bg-slate-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.previewUrl} alt={item.file.name} className="h-full w-full object-cover" />
                  </div>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#1b241f] text-xs font-semibold text-white">{index + 1}</span>
                      <p className="truncate text-sm font-semibold text-slate-950">{item.file.name}</p>
                      <StatusChip status={item.status} />
                    </div>
                    {slot ? (
                      <p className="mt-2 text-sm text-slate-500">Horario estimado: <strong className="text-slate-800">{slot.displayDate} · {slot.displayTime}</strong></p>
                    ) : null}
                    {showCaptions ? (
                      <textarea
                        value={item.caption}
                        onChange={(event) => updateCaption(item.id, event.target.value)}
                        rows={2}
                        maxLength={1500}
                        placeholder="Texto opcional para Facebook. Déjalo vacío para publicar solo la imagen."
                        disabled={isSubmitting}
                        className="focus-premium mt-3 w-full resize-y rounded-[16px] border border-[#e2ddd5] bg-white px-3 py-2.5 text-sm text-[#59625c] outline-none transition disabled:bg-[#f7f5f1]"
                      />
                    ) : null}
                  </div>

                  <div className="flex items-center gap-2 md:flex-col">
                    <IconButton label="Subir" disabled={index === 0 || isSubmitting || successItems.length > 0} onClick={() => moveItem(index, -1)}><ArrowUp size={16} /></IconButton>
                    <IconButton label="Bajar" disabled={index === items.length - 1 || isSubmitting || successItems.length > 0} onClick={() => moveItem(index, 1)}><ArrowDown size={16} /></IconButton>
                    <IconButton label="Eliminar" disabled={isSubmitting || successItems.length > 0} onClick={() => removeItem(item.id)} danger><Trash2 size={16} /></IconButton>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {items.length > 0 ? (
        <section className="surface-card p-6 sm:p-7">
          <div className="grid gap-4 md:grid-cols-3">
            <Summary label="Intervalo" value={`${intervalMinutes} min`} />
            <Summary label="Ventana" value={windowLabel} />
            <Summary label="Publicaciones" value={String(items.length)} />
          </div>

          {isSubmitting || successItems.length > 0 ? (
            <div className="mt-6 rounded-[20px] border border-[#ebe6de] bg-[#faf9f6] p-5">
              <div className="flex items-center justify-between gap-4">
                <p className="text-sm font-semibold text-slate-950">{successItems.length > 0 ? "Programación completada" : "Preparando programación"}</p>
                <span className="text-sm font-semibold text-slate-700">{successItems.length > 0 ? items.length : completedUploads} / {items.length}</span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#e7e2da]">
                <div className="h-full rounded-full bg-[#ad7f43] transition-all duration-300" style={{ width: `${progressPercent}%` }} />
              </div>
            </div>
          ) : null}

          {successItems.length > 0 ? (
            <div className="mt-5 space-y-2">
              {successItems.map((item, index) => (
                <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-[16px] border border-[#dce9df] bg-[#f1f7f3] px-4 py-3 text-sm">
                  <span className="flex min-w-0 items-center gap-2 text-emerald-800"><Check size={16} /><span className="truncate">#{index + 1} · {item.filename}</span></span>
                  <strong className="text-emerald-900">{item.displayDate} · {item.displayTime}</strong>
                </div>
              ))}
              <div className="mt-5 flex flex-wrap gap-3">
                <a href="/queue" className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white">Ver cola</a>
                <button type="button" onClick={resetBatch} className="rounded-[16px] border border-[#ded9d1] bg-white px-5 py-3 text-sm font-semibold text-[#68716b] transition hover:bg-[#faf9f6]">Programar otro lote</button>
              </div>
            </div>
          ) : (
            <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="max-w-xl text-sm leading-6 text-slate-500">Al confirmar, la app recalcula los horarios contra la cola real para mantener el intervalo sin choques.</p>
              <button
                type="button"
                onClick={handleSchedule}
                disabled={isSubmitting}
                className="inline-flex items-center justify-center gap-2 rounded-[16px] bg-[#1b241f] px-6 py-3 text-sm font-semibold text-white shadow-[0_10px_25px_rgba(27,36,31,0.10)] transition hover:-translate-y-0.5 hover:bg-[#26312b] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? <><LoaderCircle size={17} className="animate-spin" /> Subiendo {completedUploads}/{items.length}</> : `Programar ${items.length} ${items.length === 1 ? "publicación" : "publicaciones"}`}
              </button>
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}

function extensionFor(file: File) {
  if (file.type === "image/jpeg") return "jpg";
  if (file.type === "image/webp") return "webp";
  return "png";
}

function IconButton({ children, label, onClick, disabled, danger = false }: { children: React.ReactNode; label: string; onClick: () => void; disabled: boolean; danger?: boolean }) {
  return (
    <button type="button" title={label} aria-label={label} onClick={onClick} disabled={disabled} className={`flex h-9 w-9 items-center justify-center rounded-xl border transition disabled:cursor-not-allowed disabled:opacity-30 ${danger ? "border-red-100 text-red-500 hover:bg-red-50" : "border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-900"}`}>
      {children}
    </button>
  );
}

function StatusChip({ status }: { status: LocalItem["status"] }) {
  const config = {
    ready: { label: "Lista", className: "bg-slate-100 text-slate-600" },
    uploading: { label: "Subiendo", className: "bg-amber-50 text-amber-700" },
    uploaded: { label: "Subida", className: "bg-blue-50 text-blue-700" },
    scheduled: { label: "Programada", className: "bg-emerald-50 text-emerald-700" },
    error: { label: "Error", className: "bg-red-50 text-red-700" },
  }[status];

  return <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${config.className}`}>{config.label}</span>;
}

function Summary({ label, value }: { label: string; value: string }) {
  return <div className="rounded-[18px] border border-[#ece7df] bg-[#faf9f6] px-4 py-4"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">{label}</p><p className="mt-2 text-lg font-semibold text-slate-950">{value}</p></div>;
}
