/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { ImageLightbox } from "@/components/image-lightbox";
import { QueueItemActions } from "@/components/queue-item-actions";
import { SchedulerControls } from "@/components/scheduler-controls";
import { createClient } from "@/lib/supabase/server";
import { getFacebookConnectionSummary } from "@/lib/facebook/connection";
import { formatDateTimeLocalInput } from "@/lib/scheduling/slots";

const BUCKET = "generated-post-images";

export default async function QueuePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: page } = await supabase
    .from("pages")
    .select("id,timezone,publish_window_start,publish_window_end")
    .eq("owner_id", user!.id)
    .eq("slug", "ecos-del-alma")
    .maybeSingle();

  const facebook = page
    ? await getFacebookConnectionSummary({ supabase, ownerId: user!.id, pageId: page.id })
    : { status: "disconnected" as const };
  const facebookConnected = facebook.status === "connected";

  const { data: items, error } = await supabase
    .from("publication_queue")
    .select("id,storage_path,original_filename,caption,scheduled_for,status,sort_order,batch_id,ready_at,schedule_source,retry_count,next_retry_at,last_error,failure_kind")
    .eq("owner_id", user!.id)
    .in("status", ["scheduled", "ready_to_publish", "publishing", "retry_wait"])
    .order("scheduled_for", { ascending: true })
    .limit(150);

  if (error) {
    return (
      <>
        <PageHeader eyebrow="Programación" title="Cola" description="Edita horarios, cancela publicaciones y supervisa reintentos seguros." />
        <div className="rounded-[20px] border border-[#efcaca] bg-[#fff6f6] p-6 text-sm text-[#a84949]">Falta la migración operativa 009 en Supabase. Ejecútala y recarga la página.</div>
      </>
    );
  }

  const { data: health } = page
    ? await supabase
        .from("scheduler_health")
        .select("status,last_tick_at,last_error")
        .eq("owner_id", user!.id)
        .eq("page_id", page.id)
        .maybeSingle()
    : { data: null };

  const signedUrls = new Map<string, string>();
  for (const item of items ?? []) {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(item.storage_path, 60 * 60);
    if (data?.signedUrl) signedUrls.set(item.id, data.signedUrl);
  }

  const timezone = page?.timezone ?? "America/Mexico_City";
  const nowMs = Date.now();
  const dueCount = (items ?? []).filter((item) => item.status === "scheduled" && new Date(item.scheduled_for).getTime() <= nowMs).length;
  const readyCount = (items ?? []).filter((item) => item.status === "ready_to_publish").length;
  const retryCount = (items ?? []).filter((item) => item.status === "retry_wait").length;
  const healthInfo = getHealthInfo(health?.status, health?.last_tick_at, timezone);

  return (
    <>
      <PageHeader
        eyebrow="Programación"
        title="Cola de publicaciones"
        description="Revisa qué se publicará después, ajusta horarios y supervisa cualquier reintento sin perder el control del orden."
        meta={`${items?.length ?? 0} pendientes · ${timezone}`}
      />

      {!facebookConnected ? (
        <div className="mb-6 rounded-[18px] border border-[#ead7af] bg-[#fbf5e8] px-4 py-3 text-sm text-[#87652f]">
          Facebook necesita atención. La programación seguirá guardada y no perderás ninguna imagen. Ve a <Link href="/settings" className="font-semibold underline underline-offset-2">Configuración</Link>.
        </div>
      ) : null}

      <SchedulerControls
        dueCount={dueCount}
        readyCount={readyCount}
        retryCount={retryCount}
        facebookConnected={facebookConnected}
        healthLabel={healthInfo.label}
        lastTickLabel={healthInfo.lastTick}
      />

      {!items || items.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          badge="Sin publicaciones pendientes"
          title="La cola está vacía"
          description="Ve a Programación masiva, sube tus imágenes y aquí aparecerán con su fecha, hora y estado operativo."
        />
      ) : (
        <section className="space-y-3">
          {items.map((item, index) => {
            const date = new Date(item.scheduled_for);
            const dateLabel = new Intl.DateTimeFormat("es-MX", { timeZone: timezone, weekday: "short", day: "2-digit", month: "short" }).format(date);
            const timeLabel = new Intl.DateTimeFormat("es-MX", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
            const localDateTime = formatDateTimeLocalInput(date, timezone);
            const isDue = item.status === "scheduled" && date.getTime() <= nowMs;
            const retryLabel = item.next_retry_at
              ? new Intl.DateTimeFormat("es-MX", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(item.next_retry_at))
              : "siguiente ciclo";

            return (
              <article key={item.id} className="surface-card p-4">
                <div className="grid gap-4 sm:grid-cols-[84px_1fr_auto] sm:items-center">
                  <div className="h-20 w-20 overflow-hidden rounded-[18px] bg-[#f0ede7]">
                    {signedUrls.get(item.id) ? <ImageLightbox src={signedUrls.get(item.id)!} alt={item.original_filename} className="h-full w-full rounded-[18px]" /> : null}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#1b241f] text-xs font-semibold text-white">{index + 1}</span>
                      <p className="max-w-full truncate text-sm font-semibold text-slate-950">{item.original_filename}</p>
                      <QueueStatus status={item.status} due={isDue} />
                    </div>
                    <p className="mt-2 text-sm text-slate-500">{item.caption ? item.caption : "Solo imagen · sin texto"}</p>
                    {item.status === "retry_wait" ? (
                      <p className="mt-2 text-xs leading-5 text-violet-700">Reintento automático #{item.retry_count} · {retryLabel}. {item.last_error}</p>
                    ) : null}
                    {item.schedule_source === "manual" ? <p className="mt-2 text-[11px] font-medium text-slate-400">Horario editado manualmente</p> : null}
                    {item.schedule_source === "publish_now" ? <p className="mt-2 text-[11px] font-medium text-sky-600">Marcada para publicar ahora</p> : null}
                  </div>
                  <div className="rounded-[18px] border border-[#ebe6de] bg-[#faf9f6] px-4 py-3 text-right">
                    <p className="text-xs font-medium text-slate-400">{dateLabel}</p>
                    <p className="mt-1 text-xl font-semibold text-slate-950">{timeLabel}</p>
                  </div>
                </div>

                <QueueItemActions
                  itemId={item.id}
                  currentLocalDateTime={localDateTime}
                  status={item.status}
                  facebookConnected={facebookConnected}
                />
              </article>
            );
          })}
        </section>
      )}

      <section className="mt-6 surface-card px-5 py-4 text-sm leading-6 text-[#737b75]">
        Ventana configurada: <strong className="text-slate-800">{(page?.publish_window_start ?? "07:00").slice(0, 5)} – {(page?.publish_window_end ?? "23:00").slice(0, 5)}</strong> · Zona horaria: <strong className="text-slate-800">{timezone}</strong>.
        {health?.last_error ? <span className="mt-1 block text-amber-700">Última alerta del scheduler: {health.last_error}</span> : null}
      </section>
    </>
  );
}

function QueueStatus({ status, due }: { status: string; due: boolean }) {
  if (status === "retry_wait") {
    return <span className="rounded-full bg-[#f2eff7] px-2.5 py-1 text-[11px] font-semibold text-[#74678a]">Reintento programado</span>;
  }

  if (status === "ready_to_publish") {
    return <span className="rounded-full bg-[#eef3f5] px-2.5 py-1 text-[11px] font-semibold text-[#55727e]">Lista para publicar</span>;
  }

  if (status === "publishing") {
    return <span className="rounded-full bg-[#f2eff7] px-2.5 py-1 text-[11px] font-semibold text-[#74678a]">Publicando</span>;
  }

  if (due) {
    return <span className="rounded-full bg-[#fbf3e6] px-2.5 py-1 text-[11px] font-semibold text-[#a77335]">Horario alcanzado</span>;
  }

  return <span className="rounded-full bg-[#edf4ef] px-2.5 py-1 text-[11px] font-semibold text-[#557460]">Programada</span>;
}

function getHealthInfo(status: string | undefined, lastTickAt: string | null | undefined, timezone: string) {
  if (!lastTickAt) return { label: "sin ciclos", lastTick: "todavía no ejecutado" };

  const ageMs = Date.now() - new Date(lastTickAt).getTime();
  const stale = ageMs > 5 * 60_000;
  const label = stale ? "sin actividad" : status === "healthy" ? "activo" : status === "warning" ? "con alertas" : status === "error" ? "error" : "pendiente";
  const lastTick = new Intl.DateTimeFormat("es-MX", { timeZone: timezone, dateStyle: "short", timeStyle: "short" }).format(new Date(lastTickAt));
  return { label, lastTick };
}
