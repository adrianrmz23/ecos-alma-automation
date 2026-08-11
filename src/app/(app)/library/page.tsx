/* eslint-disable @next/next/no-img-element */

import { AlertTriangle, History } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { HistoryItemActions } from "@/components/history-item-actions";
import { PageHeader } from "@/components/page-header";
import { ImageLightbox } from "@/components/image-lightbox";
import { createClient } from "@/lib/supabase/server";

const BUCKET = "generated-post-images";

export default async function HistoryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: page } = await supabase
    .from("pages")
    .select("timezone")
    .eq("owner_id", user!.id)
    .eq("slug", "ecos-del-alma")
    .maybeSingle();

  const { data: items, error } = await supabase
    .from("publication_queue")
    .select("id,storage_path,original_filename,caption,scheduled_for,status,published_at,last_error,facebook_post_id,facebook_photo_id,attempts,retry_count,last_attempt_at,failure_kind,last_http_status,last_error_code,manual_resolution")
    .eq("owner_id", user!.id)
    .in("status", ["published", "failed", "needs_review", "cancelled"])
    .order("updated_at", { ascending: false })
    .limit(150);

  if (error) {
    return (
      <>
        <PageHeader title="Historial" description="Aquí aparecen las publicaciones terminadas, canceladas o con error." />
        <div className="rounded-[20px] border border-[#efcaca] bg-[#fff6f6] p-6 text-sm text-[#a84949]">Falta la migración operativa 009 en Supabase. Ejecútala y recarga la página.</div>
      </>
    );
  }

  const signedUrls = new Map<string, string>();
  for (const item of items ?? []) {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(item.storage_path, 60 * 60);
    if (data?.signedUrl) signedUrls.set(item.id, data.signedUrl);
  }

  const timezone = page?.timezone ?? "America/Mexico_City";
  const reviewCount = (items ?? []).filter((item) => item.status === "needs_review").length;

  return (
    <>
      <PageHeader
        eyebrow="Registro"
        title="Historial de publicaciones"
        description="Consulta lo que ya se publicó, lo que cancelaste y cualquier incidencia que necesite revisión."
        meta={`${items?.length ?? 0} registros`}
      />

      {reviewCount > 0 ? (
        <div className="mb-6 flex items-start gap-3 rounded-[18px] border border-[#ead7af] bg-[#fbf5e8] px-4 py-4 text-sm text-[#87652f]">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold">{reviewCount} publicación{reviewCount === 1 ? " requiere" : "es requieren"} revisión manual</p>
            <p className="mt-1 leading-6">Antes de reintentar una publicación ambigua, comprueba en Facebook si la imagen ya apareció. Así evitamos duplicados.</p>
          </div>
        </div>
      ) : null}

      {!items || items.length === 0 ? (
        <EmptyState
          icon={History}
          badge="Todavía vacío"
          title="Aún no hay publicaciones terminadas"
          description="Las imágenes programadas permanecen en Cola. Al publicarse, cancelarse o fallar aparecerán automáticamente aquí."
        />
      ) : (
        <section className="space-y-3">
          {items.map((item) => {
            const date = new Date(item.published_at || item.last_attempt_at || item.scheduled_for);
            const dateLabel = new Intl.DateTimeFormat("es-MX", { timeZone: timezone, dateStyle: "medium", timeStyle: "short" }).format(date);
            return (
              <article key={item.id} className={`grid gap-4 rounded-[24px] border bg-white/95 p-4 shadow-[0_12px_35px_rgba(31,37,32,0.035)] sm:grid-cols-[84px_1fr_auto] sm:items-start ${item.status === "needs_review" ? "border-[#ead7af]" : "border-[#e7e3db]"}`}>
                <div className="h-20 w-20 overflow-hidden rounded-[18px] bg-[#f0ede7]">
                  {signedUrls.get(item.id) ? <ImageLightbox src={signedUrls.get(item.id)!} alt={item.original_filename} className="h-full w-full rounded-[18px]" /> : null}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-950">{item.original_filename}</p>
                  <p className="mt-1 text-sm text-slate-500">{item.caption || "Solo imagen · sin texto"}</p>
                  {item.facebook_post_id ? <p className="mt-2 text-xs text-slate-400">Facebook Post ID: {item.facebook_post_id}</p> : null}
                  {item.last_error ? <p className={`mt-2 text-xs leading-5 ${item.status === "needs_review" ? "text-amber-700" : "text-red-600"}`}>{item.last_error}</p> : null}
                  {(item.last_error_code || item.last_http_status) ? (
                    <p className="mt-1 text-[11px] text-slate-400">
                      {item.last_error_code ? `Código: ${item.last_error_code}` : ""}{item.last_error_code && item.last_http_status ? " · " : ""}{item.last_http_status ? `HTTP ${item.last_http_status}` : ""}
                    </p>
                  ) : null}
                  <HistoryItemActions itemId={item.id} status={item.status} />
                </div>
                <div className="text-right">
                  <Status status={item.status} />
                  <p className="mt-2 text-xs text-slate-400">{dateLabel}</p>
                  {item.attempts > 0 ? <p className="mt-1 text-[11px] text-slate-400">Intentos: {item.attempts}</p> : null}
                  {item.retry_count > 0 ? <p className="mt-1 text-[11px] text-slate-400">Reintentos auto: {item.retry_count}</p> : null}
                  {item.manual_resolution ? <p className="mt-1 text-[11px] text-slate-400">Resolución manual</p> : null}
                </div>
              </article>
            );
          })}
        </section>
      )}
    </>
  );
}

function Status({ status }: { status: string }) {
  if (status === "published") return <span className="rounded-full bg-[#edf4ef] px-2.5 py-1 text-[11px] font-semibold text-[#557460]">Publicada</span>;
  if (status === "needs_review") return <span className="rounded-full bg-[#fbf3e6] px-2.5 py-1 text-[11px] font-semibold text-[#a77335]">Revisar antes de reintentar</span>;
  if (status === "failed") return <span className="rounded-full bg-[#fff0f0] px-2.5 py-1 text-[11px] font-semibold text-[#a94d4d]">Error</span>;
  return <span className="rounded-full bg-[#f1efeb] px-2.5 py-1 text-[11px] font-semibold text-[#6f7771]">Cancelada</span>;
}
