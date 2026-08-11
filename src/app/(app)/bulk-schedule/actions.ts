"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { calculateBulkSlots, formatSlotForDisplay } from "@/lib/scheduling/slots";

type UploadedBulkItem = {
  storagePath: string;
  originalFilename: string;
  mimeType: string;
  caption?: string;
};

type SaveBulkScheduleInput = {
  batchId: string;
  items: UploadedBulkItem[];
};

type SaveBulkScheduleResult =
  | {
      ok: true;
      batchId: string;
      scheduled: Array<{
        id: string;
        filename: string;
        scheduledFor: string;
        displayDate: string;
        displayTime: string;
      }>;
    }
  | { ok: false; error: string };

export async function saveBulkSchedule(input: SaveBulkScheduleInput): Promise<SaveBulkScheduleResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, error: "Tu sesión expiró. Vuelve a iniciar sesión." };

  const items = Array.isArray(input.items) ? input.items.slice(0, 10) : [];
  if (items.length === 0) return { ok: false, error: "No recibimos imágenes para programar." };
  if (input.items.length > 10) return { ok: false, error: "El máximo por carga es de 10 imágenes." };

  const allowedMime = new Set(["image/png", "image/jpeg", "image/webp"]);
  const expectedPrefix = `${user.id}/bulk/${input.batchId}/`;

  for (const item of items) {
    if (!item.storagePath.startsWith(expectedPrefix)) {
      return { ok: false, error: "Detectamos una ruta de archivo inválida." };
    }
    if (!allowedMime.has(item.mimeType)) {
      return { ok: false, error: `Formato no permitido: ${item.originalFilename}` };
    }
  }

  const { data: page } = await supabase
    .from("pages")
    .select("id,timezone,publish_interval_minutes,publish_window_start,publish_window_end")
    .eq("owner_id", user.id)
    .eq("slug", "ecos-del-alma")
    .maybeSingle();

  if (!page) {
    await cleanupUploadedFiles(supabase, items.map((item) => item.storagePath));
    return { ok: false, error: "Primero configura Ecos del Alma en Configuración." };
  }

  const { data: lastQueueItem } = await supabase
    .from("publication_queue")
    .select("scheduled_for")
    .eq("owner_id", user.id)
    .in("status", ["scheduled", "ready_to_publish", "publishing"])
    .order("scheduled_for", { ascending: false })
    .limit(1)
    .maybeSingle();

  const rules = {
    timezone: page.timezone,
    intervalMinutes: page.publish_interval_minutes,
    windowStart: page.publish_window_start,
    windowEnd: page.publish_window_end,
  };

  const slots = calculateBulkSlots({
    count: items.length,
    rules,
    lastScheduledFor: lastQueueItem?.scheduled_for ?? null,
  });

  const { error: batchError } = await supabase.from("bulk_schedule_batches").insert({
    id: input.batchId,
    owner_id: user.id,
    page_id: page.id,
    item_count: items.length,
    status: "scheduled",
  });

  if (batchError) {
    await cleanupUploadedFiles(supabase, items.map((item) => item.storagePath));
    return { ok: false, error: `No pudimos crear el lote: ${batchError.message}` };
  }

  const queuePayload = items.map((item, index) => ({
    owner_id: user.id,
    page_id: page.id,
    batch_id: input.batchId,
    source: "bulk_upload",
    storage_path: item.storagePath,
    original_filename: item.originalFilename,
    mime_type: item.mimeType,
    caption: (item.caption ?? "").trim(),
    sort_order: index,
    scheduled_for: slots[index].toISOString(),
    status: "scheduled",
  }));

  const { data: inserted, error: queueError } = await supabase
    .from("publication_queue")
    .insert(queuePayload)
    .select("id,original_filename,scheduled_for,sort_order");

  if (queueError || !inserted) {
    await supabase.from("bulk_schedule_batches").delete().eq("id", input.batchId).eq("owner_id", user.id);
    await cleanupUploadedFiles(supabase, items.map((item) => item.storagePath));
    return { ok: false, error: `No pudimos guardar la programación: ${queueError?.message ?? "error desconocido"}` };
  }

  revalidatePath("/");
  revalidatePath("/bulk-schedule");
  revalidatePath("/queue");
  revalidatePath("/library");

  const scheduled = inserted
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((item) => {
      const date = new Date(item.scheduled_for);
      const display = formatSlotForDisplay(date, page.timezone);
      return {
        id: item.id,
        filename: item.original_filename,
        scheduledFor: item.scheduled_for,
        displayDate: display.date,
        displayTime: display.time,
      };
    });

  return { ok: true, batchId: input.batchId, scheduled };
}

async function cleanupUploadedFiles(
  supabase: Awaited<ReturnType<typeof createClient>>,
  paths: string[],
) {
  if (paths.length === 0) return;
  await supabase.storage.from("generated-post-images").remove(paths);
}
