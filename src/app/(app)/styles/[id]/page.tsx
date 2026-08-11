/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Check, ImageIcon, Star, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ReferenceUploader } from "@/components/reference-uploader";
import { StyleForm } from "@/components/style-form";
import { createClient } from "@/lib/supabase/server";
import { deleteReference, deleteStyle, setPrimaryReference, updateStyle } from "../actions";

const BUCKET = "style-references";

type StyleDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    created?: string;
    saved?: string;
    primary?: string;
    reference_deleted?: string;
    error?: string;
  }>;
};

export default async function StyleDetailPage({ params, searchParams }: StyleDetailPageProps) {
  const { id } = await params;
  const query = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: style } = await supabase
    .from("visual_styles")
    .select("*")
    .eq("id", id)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!style) notFound();

  const { data: references } = await supabase
    .from("style_references")
    .select("*")
    .eq("style_id", style.id)
    .eq("owner_id", user.id)
    .order("is_primary", { ascending: false })
    .order("sort_order", { ascending: true });

  const refsWithUrls = await Promise.all(
    (references ?? []).map(async (reference) => {
      const { data } = await supabase.storage.from(BUCKET).createSignedUrl(reference.storage_path, 60 * 60);
      return { ...reference, signedUrl: data?.signedUrl ?? null };
    }),
  );

  return (
    <>
      <PageHeader
        eyebrow="Bloque 2 · Biblioteca visual"
        title={style.name}
        description="Edita la guía del estilo y administra las imágenes que la IA utilizará como referencias visuales."
      />

      {query.created ? <Notice>Estilo creado. Ahora agrega al menos una referencia visual.</Notice> : null}
      {query.saved ? <Notice>Estilo actualizado correctamente.</Notice> : null}
      {query.primary ? <Notice>Referencia principal actualizada.</Notice> : null}
      {query.reference_deleted ? <Notice>Referencia eliminada.</Notice> : null}
      {query.error ? (
        <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {query.error === "duplicate"
            ? "Ya existe otro estilo con ese nombre."
            : query.error === "storage"
              ? "Hubo un problema al modificar el archivo en Storage. Revisa el bucket y sus políticas."
              : "No pudimos completar la operación."}
        </div>
      ) : null}

      <section className="mb-8 rounded-[28px] border border-slate-200 bg-white p-6 sm:p-7">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Referencias</p>
            <h2 className="mt-2 text-xl font-semibold text-slate-950">Imágenes base</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
              La referencia principal será la primera candidata del generador. Las demás sirven para reforzar la identidad del estilo y aportar variaciones.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge>{refsWithUrls.length} referencias</Badge>
            <Badge>{style.auto_select_enabled ? "IA habilitada" : "Solo manual"}</Badge>
          </div>
        </div>

        {refsWithUrls.length > 0 ? (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {refsWithUrls.map((reference) => (
              <article key={reference.id} className="overflow-hidden rounded-[24px] border border-slate-200 bg-white">
                <div className="relative aspect-square bg-slate-100">
                  {reference.signedUrl ? (
                    <img src={reference.signedUrl} alt={reference.original_filename} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-slate-300"><ImageIcon size={28} /></div>
                  )}
                  {reference.is_primary ? (
                    <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-semibold text-slate-800 shadow-sm">
                      <Star size={12} className="fill-current" /> Principal
                    </span>
                  ) : null}
                </div>
                <div className="p-4">
                  <p className="truncate text-sm font-medium text-slate-800" title={reference.original_filename}>{reference.original_filename}</p>
                  <p className="mt-1 text-xs text-slate-400">{formatBytes(reference.byte_size)}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {!reference.is_primary ? (
                      <form action={setPrimaryReference}>
                        <input type="hidden" name="style_id" value={style.id} />
                        <input type="hidden" name="reference_id" value={reference.id} />
                        <button type="submit" className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50">
                          <Star size={13} /> Hacer principal
                        </button>
                      </form>
                    ) : null}
                    <form action={deleteReference}>
                      <input type="hidden" name="style_id" value={style.id} />
                      <input type="hidden" name="reference_id" value={reference.id} />
                      <button type="submit" className="inline-flex items-center gap-1.5 rounded-xl border border-red-100 px-3 py-2 text-xs font-semibold text-red-600 transition hover:bg-red-50">
                        <Trash2 size={13} /> Eliminar
                      </button>
                    </form>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="mt-6 flex min-h-44 items-center justify-center rounded-[24px] border border-slate-200 bg-slate-50 px-6 text-center">
            <div>
              <ImageIcon className="mx-auto text-slate-300" size={28} />
              <p className="mt-3 text-sm font-semibold text-slate-700">Todavía no hay referencias</p>
              <p className="mt-1 text-xs text-slate-400">Carga las imágenes que ya representan correctamente este estilo.</p>
            </div>
          </div>
        )}

        <div className="mt-5">
          <ReferenceUploader ownerId={user.id} styleId={style.id} currentCount={refsWithUrls.length} />
        </div>
      </section>

      <StyleForm style={style} action={updateStyle} submitLabel="Guardar cambios" />

      <section className="mt-8 rounded-[28px] border border-red-100 bg-red-50/50 p-6 sm:p-7">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-sm font-semibold text-red-900">Eliminar estilo</h2>
            <p className="mt-1 text-sm leading-6 text-red-700/80">Se eliminarán también sus referencias almacenadas. Esta acción no se puede deshacer.</p>
          </div>
          <form action={deleteStyle}>
            <input type="hidden" name="style_id" value={style.id} />
            <button type="submit" className="inline-flex items-center gap-2 rounded-2xl border border-red-200 bg-white px-4 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-50">
              <Trash2 size={16} /> Eliminar estilo
            </button>
          </form>
        </div>
      </section>

      <div className="mt-6">
        <Link href="/styles" className="text-sm font-semibold text-slate-500 transition hover:text-slate-900">← Volver a estilos</Link>
      </div>
    </>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-6 flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
      <Check size={16} /> {children}
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{children}</span>;
}

function formatBytes(value: number) {
  if (!value) return "0 KB";
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}
