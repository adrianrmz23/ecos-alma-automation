"use client";

import { useRef, useState } from "react";
import { ImagePlus, Loader2, UploadCloud } from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const BUCKET = "style-references";
const MAX_FILE_SIZE = 8 * 1024 * 1024;
const MAX_REFERENCES = 8;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

export function ReferenceUploader({
  ownerId,
  styleId,
  currentCount,
}: {
  ownerId: string;
  styleId: string;
  currentCount: number;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const remaining = Math.max(0, MAX_REFERENCES - currentCount);

  async function uploadFiles(files: FileList | null) {
    if (!files?.length || remaining === 0) return;

    const selected = Array.from(files).slice(0, remaining);
    const invalid = selected.find((file) => !ALLOWED_TYPES.includes(file.type) || file.size > MAX_FILE_SIZE);

    if (invalid) {
      setMessage("Usa JPG, PNG o WEBP de máximo 8 MB por archivo.");
      return;
    }

    setBusy(true);
    setMessage(null);
    const supabase = createClient();

    try {
      const { count } = await supabase
        .from("style_references")
        .select("id", { count: "exact", head: true })
        .eq("style_id", styleId);

      let sortOrder = count ?? currentCount;

      for (const file of selected) {
        const extension = getExtension(file);
        const storagePath = `${ownerId}/${styleId}/${crypto.randomUUID()}.${extension}`;

        const { error: uploadError } = await supabase.storage
          .from(BUCKET)
          .upload(storagePath, file, {
            cacheControl: "3600",
            contentType: file.type,
            upsert: false,
          });

        if (uploadError) throw uploadError;

        const { error: rowError } = await supabase.from("style_references").insert({
          owner_id: ownerId,
          style_id: styleId,
          storage_path: storagePath,
          original_filename: file.name,
          mime_type: file.type,
          byte_size: file.size,
          sort_order: sortOrder,
          is_primary: sortOrder === 0,
        });

        if (rowError) {
          await supabase.storage.from(BUCKET).remove([storagePath]);
          throw rowError;
        }

        sortOrder += 1;
      }

      setMessage(selected.length === 1 ? "Referencia cargada correctamente." : `${selected.length} referencias cargadas correctamente.`);
      if (inputRef.current) inputRef.current.value = "";
      router.refresh();
    } catch (error) {
      const text = error instanceof Error ? error.message : "No se pudieron cargar las referencias.";
      setMessage(`Error: ${text}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-[28px] border border-dashed border-slate-300 bg-slate-50/70 p-6">
      <div className="flex flex-col items-center text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-slate-700 shadow-sm ring-1 ring-slate-200">
          <ImagePlus size={21} />
        </div>
        <h3 className="mt-4 text-sm font-semibold text-slate-950">Agregar referencias visuales</h3>
        <p className="mt-2 max-w-xl text-xs leading-5 text-slate-500">
          Puedes guardar hasta {MAX_REFERENCES} imágenes por estilo. JPG, PNG o WEBP · máximo 8 MB cada una. Las referencias quedan privadas en Supabase Storage.
        </p>

        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="hidden"
          disabled={busy || remaining === 0}
          onChange={(event) => uploadFiles(event.target.files)}
        />

        <button
          type="button"
          disabled={busy || remaining === 0}
          onClick={() => inputRef.current?.click()}
          className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {busy ? <Loader2 size={16} className="animate-spin" /> : <UploadCloud size={16} />}
          {busy ? "Subiendo..." : remaining === 0 ? "Límite alcanzado" : "Seleccionar imágenes"}
        </button>
        <p className="mt-3 text-xs text-slate-400">{currentCount}/{MAX_REFERENCES} referencias guardadas</p>
        {message ? <p className={`mt-3 text-xs ${message.startsWith("Error") ? "text-red-600" : "text-emerald-700"}`}>{message}</p> : null}
      </div>
    </div>
  );
}

function getExtension(file: File) {
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  return "jpg";
}
