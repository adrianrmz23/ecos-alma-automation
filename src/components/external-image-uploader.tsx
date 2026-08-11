"use client";

import { useRef, useState } from "react";
import { ImagePlus, LoaderCircle, UploadCloud } from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { registerExternalImage } from "@/app/(app)/generate/[id]/actions";

const BUCKET = "generated-post-images";
const MAX_BYTES = 15 * 1024 * 1024;
const ALLOWED = new Set(["image/png", "image/jpeg", "image/webp"]);

export function ExternalImageUploader({ postId }: { postId: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [message, setMessage] = useState<string>("");
  const [messageTone, setMessageTone] = useState<"success" | "error">("error");
  const [uploading, setUploading] = useState(false);
  const router = useRouter();

  function chooseFile(next: File | null) {
    setMessage("");
    setMessageTone("error");
    if (!next) return;
    if (!ALLOWED.has(next.type)) {
      setMessage("Solo se permiten PNG, JPG/JPEG o WEBP.");
      return;
    }
    if (next.size > MAX_BYTES) {
      setMessage("La imagen supera el límite de 15 MB.");
      return;
    }
    setFile(next);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(URL.createObjectURL(next));
  }

  async function upload() {
    if (!file) {
      setMessage("Selecciona una imagen primero.");
      return;
    }

    setUploading(true);
    setMessage("");
    setMessageTone("error");

    try {
      const supabase = createClient();
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) throw new Error("No pudimos validar tu sesión.");

      const extension = file.name.split(".").pop()?.toLowerCase() || (file.type === "image/webp" ? "webp" : file.type === "image/jpeg" ? "jpg" : "png");
      const storagePath = `${user.id}/${postId}/${crypto.randomUUID()}.${extension}`;

      const { error: uploadError } = await supabase.storage.from(BUCKET).upload(storagePath, file, {
        contentType: file.type,
        upsert: false,
      });

      if (uploadError) throw uploadError;

      const result = await registerExternalImage({
        postId,
        storagePath,
        mimeType: file.type,
        byteSize: file.size,
        originalFilename: file.name,
      });

      setMessageTone("success");
      if (result.outcome.state === "approved") {
        setMessage("Imagen cargada, QA completado y post autoaprobado.");
      } else if (result.outcome.state === "waiting_approval") {
        setMessage("Imagen cargada y QA completado. El workflow espera tu aprobación.");
      } else if (result.outcome.state === "failed") {
        setMessageTone("error");
        setMessage(`La imagen se cargó, pero el workflow falló: ${result.outcome.error}`);
      } else {
        setMessage("Imagen cargada. El workflow continuó correctamente.");
      }
      setFile(null);
      if (preview) URL.revokeObjectURL(preview);
      setPreview(null);
      if (inputRef.current) inputRef.current.value = "";
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No pudimos subir la imagen.");
    } finally {
      setUploading(false);
    }
  }

  const busy = uploading;

  return (
    <div className="space-y-4">
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(event) => chooseFile(event.target.files?.[0] ?? null)}
      />

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="flex w-full items-center justify-center gap-2 rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-white"
      >
        <ImagePlus size={18} />
        {file ? "Cambiar imagen seleccionada" : "Seleccionar imagen de ChatGPT"}
      </button>

      {preview ? (
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-slate-50">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="Vista previa" className="h-auto w-full object-cover" />
          <div className="flex items-center justify-between gap-4 border-t border-slate-200 px-4 py-3 text-xs text-slate-500">
            <span className="truncate">{file?.name}</span>
            <span>{file ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : ""}</span>
          </div>
        </div>
      ) : null}

      {message ? <p className={`text-sm ${messageTone === "success" ? "text-emerald-600" : "text-red-600"}`}>{message}</p> : null}

      <button
        type="button"
        onClick={upload}
        disabled={!file || busy}
        className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? <LoaderCircle size={17} className="animate-spin" /> : <UploadCloud size={17} />}
        {busy ? "Guardando imagen..." : "Usar esta imagen en el post"}
      </button>
    </div>
  );
}
