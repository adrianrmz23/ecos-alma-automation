import { PageHeader } from "@/components/page-header";
import { BulkScheduleUploader } from "@/components/bulk-schedule-uploader";
import { createClient } from "@/lib/supabase/server";
import { calculateBulkSlots, formatSlotForDisplay } from "@/lib/scheduling/slots";

export default async function BulkSchedulePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: page } = await supabase
    .from("pages")
    .select("id,timezone,publish_interval_minutes,publish_window_start,publish_window_end")
    .eq("owner_id", user!.id)
    .eq("slug", "ecos-del-alma")
    .maybeSingle();

  if (!page) {
    return (
      <>
        <PageHeader eyebrow="Programación" title="Programación masiva" description="Sube hasta 10 imágenes y deja que la app calcule automáticamente el orden y los horarios." />
        <div className="rounded-[20px] border border-[#ead7af] bg-[#fbf5e8] p-6 text-sm leading-6 text-[#87652f]">
          Primero configura Ecos del Alma en la sección Configuración.
        </div>
      </>
    );
  }

  const { data: lastQueueItem, error: queueError } = await supabase
    .from("publication_queue")
    .select("scheduled_for")
    .eq("owner_id", user!.id)
    .in("status", ["scheduled", "ready_to_publish", "publishing"])
    .order("scheduled_for", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (queueError) {
    return (
      <>
        <PageHeader eyebrow="Programación" title="Programación masiva" description="Sube hasta 10 imágenes y deja que la app calcule automáticamente el orden y los horarios." />
        <div className="rounded-[20px] border border-[#efcaca] bg-[#fff6f6] p-6 text-sm leading-6 text-[#a84949]">
          No pudimos cargar la programación masiva. Ejecuta primero la migración <strong>0061_block_6_bulk_scheduling.sql</strong> en Supabase.
        </div>
      </>
    );
  }

  const rules = {
    timezone: page.timezone,
    intervalMinutes: page.publish_interval_minutes,
    windowStart: page.publish_window_start,
    windowEnd: page.publish_window_end,
  };

  const slots = calculateBulkSlots({
    count: 10,
    rules,
    lastScheduledFor: lastQueueItem?.scheduled_for ?? null,
  }).map((date) => {
    const display = formatSlotForDisplay(date, page.timezone);
    return {
      iso: date.toISOString(),
      displayDate: display.date,
      displayTime: display.time,
    };
  });

  return (
    <>
      <PageHeader
        eyebrow="Programación"
        title="Programa tu próximo lote"
        description="Sube tus imágenes, ordénalas y confirma hasta 10 publicaciones de una sola vez. Por defecto se publica únicamente la imagen; el texto sigue siendo opcional."
        meta={`Cada ${page.publish_interval_minutes} min · ${page.timezone}`}
      />

      <BulkScheduleUploader
        suggestedSlots={slots}
        intervalMinutes={page.publish_interval_minutes}
        windowLabel={`${page.publish_window_start.slice(0, 5)} – ${page.publish_window_end.slice(0, 5)}`}
      />
    </>
  );
}
