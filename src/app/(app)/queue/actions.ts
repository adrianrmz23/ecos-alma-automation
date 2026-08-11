"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { publishQueueItem } from "@/lib/facebook/queue-publisher";
import { getFacebookConnectionSummary } from "@/lib/facebook/connection";
import { runSchedulerEngine } from "@/lib/scheduling/scheduler-engine";
import { isInsidePublishingWindow, localDateTimeToUtc } from "@/lib/scheduling/slots";

type ActionResult =
  | { ok: true; message: string; processed?: number; published?: number; failed?: number }
  | { ok: false; error: string };

async function getContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false as const, error: "Tu sesión expiró. Vuelve a iniciar sesión." };

  const { data: page } = await supabase
    .from("pages")
    .select("id,timezone,publish_interval_minutes,publish_window_start,publish_window_end")
    .eq("owner_id", user.id)
    .eq("slug", "ecos-del-alma")
    .maybeSingle();

  if (!page) return { ok: false as const, error: "Primero configura Ecos del Alma." };

  return { ok: true as const, supabase, user, page };
}

export async function updateQueueSchedule(input: { itemId: string; localDateTime: string }): Promise<ActionResult> {
  const context = await getContext();
  if (!context.ok) return context;

  const { supabase, user, page } = context;
  const scheduledFor = localDateTimeToUtc(input.localDateTime, page.timezone);
  if (!scheduledFor) return { ok: false, error: "La fecha u hora no es válida." };
  if (scheduledFor.getTime() <= Date.now()) return { ok: false, error: "El nuevo horario debe estar en el futuro." };

  const rules = {
    timezone: page.timezone,
    intervalMinutes: page.publish_interval_minutes,
    windowStart: page.publish_window_start,
    windowEnd: page.publish_window_end,
  };

  if (!isInsidePublishingWindow(scheduledFor, rules)) {
    return {
      ok: false,
      error: `El horario debe estar dentro de la ventana ${(page.publish_window_start ?? "07:00").slice(0, 5)} – ${(page.publish_window_end ?? "23:00").slice(0, 5)}.`,
    };
  }

  const { data: item } = await supabase
    .from("publication_queue")
    .select("id,status")
    .eq("id", input.itemId)
    .eq("owner_id", user.id)
    .eq("page_id", page.id)
    .maybeSingle();

  if (!item) return { ok: false, error: "No encontramos esa publicación en tu cola." };
  if (!["scheduled", "ready_to_publish"].includes(item.status)) {
    return { ok: false, error: "Ese elemento ya no puede reprogramarse." };
  }

  const { data: activeOthers } = await supabase
    .from("publication_queue")
    .select("id,scheduled_for")
    .eq("page_id", page.id)
    .in("status", ["scheduled", "ready_to_publish", "publishing"])
    .neq("id", item.id)
    .limit(500);

  const minimumGapMs = Math.max(15, page.publish_interval_minutes) * 60_000;
  const tooClose = (activeOthers ?? []).find((other) =>
    Math.abs(new Date(other.scheduled_for).getTime() - scheduledFor.getTime()) < minimumGapMs,
  );

  if (tooClose) {
    return {
      ok: false,
      error: `Debe haber al menos ${page.publish_interval_minutes} minutos entre publicaciones.`,
    };
  }

  const { error } = await supabase
    .from("publication_queue")
    .update({
      scheduled_for: scheduledFor.toISOString(),
      status: "scheduled",
      ready_at: null,
      schedule_source: "manual",
    })
    .eq("id", item.id)
    .eq("owner_id", user.id);

  if (error) return { ok: false, error: `No pudimos actualizar el horario: ${error.message}` };

  revalidateQueueViews();
  return { ok: true, message: "Horario actualizado correctamente." };
}

export async function cancelQueueItem(itemId: string): Promise<ActionResult> {
  const context = await getContext();
  if (!context.ok) return context;

  const { supabase, user, page } = context;
  const { data: item } = await supabase
    .from("publication_queue")
    .select("id,status")
    .eq("id", itemId)
    .eq("owner_id", user.id)
    .eq("page_id", page.id)
    .maybeSingle();

  if (!item) return { ok: false, error: "No encontramos esa publicación." };
  if (["published", "cancelled"].includes(item.status)) {
    return { ok: false, error: "Ese elemento ya no puede cancelarse." };
  }

  const { error } = await supabase
    .from("publication_queue")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      ready_at: null,
    })
    .eq("id", item.id)
    .eq("owner_id", user.id);

  if (error) return { ok: false, error: `No pudimos cancelar: ${error.message}` };

  revalidateQueueViews();
  return { ok: true, message: "Publicación cancelada." };
}

export async function markPublishNow(itemId: string): Promise<ActionResult> {
  const context = await getContext();
  if (!context.ok) return context;

  const { supabase, user, page } = context;
  const facebook = await getFacebookConnectionSummary({ supabase, ownerId: user.id, pageId: page.id });
  if (facebook.status !== "connected") {
    return {
      ok: false,
      error: facebook.status === "reconnect_required"
        ? "Facebook requiere reconexión. Ve a Configuración → Facebook."
        : "Facebook todavía no está conectado. Ve a Configuración → Facebook.",
    };
  }

  const { data: item } = await supabase
    .from("publication_queue")
    .select("id,status")
    .eq("id", itemId)
    .eq("owner_id", user.id)
    .eq("page_id", page.id)
    .maybeSingle();

  if (!item) return { ok: false, error: "No encontramos esa publicación." };
  if (!["scheduled", "ready_to_publish"].includes(item.status)) {
    return { ok: false, error: "Ese elemento no puede publicarse ahora." };
  }

  if (item.status === "scheduled") {
    const now = new Date();
    const { error } = await supabase
      .from("publication_queue")
      .update({
        scheduled_for: now.toISOString(),
        status: "ready_to_publish",
        ready_at: now.toISOString(),
        schedule_source: "publish_now",
      })
      .eq("id", item.id)
      .eq("owner_id", user.id);

    if (error) return { ok: false, error: `No pudimos preparar la publicación: ${error.message}` };
  }

  const published = await publishQueueItem({
    supabase,
    itemId: item.id,
    ownerId: user.id,
    pageId: page.id,
  });

  revalidateQueueViews();
  return published.ok
    ? { ok: true, message: "Imagen publicada correctamente en Facebook.", published: 1, failed: 0 }
    : { ok: false, error: published.error };
}


export async function retryQueueNow(itemId: string): Promise<ActionResult> {
  const context = await getContext();
  if (!context.ok) return context;

  const { supabase, user, page } = context;
  const { data: item } = await supabase
    .from("publication_queue")
    .select("id,status")
    .eq("id", itemId)
    .eq("owner_id", user.id)
    .eq("page_id", page.id)
    .maybeSingle();

  if (!item) return { ok: false, error: "No encontramos esa publicación." };
  if (item.status !== "retry_wait") {
    return { ok: false, error: "Esta publicación no está esperando un reintento automático." };
  }

  const { error } = await supabase
    .from("publication_queue")
    .update({
      status: "ready_to_publish",
      next_retry_at: null,
      ready_at: new Date().toISOString(),
      last_error: "Reintento adelantado manualmente.",
    })
    .eq("id", item.id)
    .eq("owner_id", user.id);

  if (error) return { ok: false, error: `No pudimos adelantar el reintento: ${error.message}` };

  revalidateQueueViews();
  return { ok: true, message: "La publicación quedó lista para reintentar en el siguiente ciclo." };
}

export async function runSchedulerForCurrentUser(): Promise<ActionResult> {
  const context = await getContext();
  if (!context.ok) return context;

  const { supabase, user, page } = context;
  const result = await runSchedulerEngine({
    supabase,
    triggerSource: "manual",
    scope: { ownerId: user.id, pageId: page.id },
  });

  const pageResult = result.results[0];
  revalidateQueueViews();

  if (!pageResult) {
    return { ok: false, error: "No pudimos ejecutar el scheduler para Ecos del Alma." };
  }

  if (pageResult.error) {
    return { ok: false, error: pageResult.error };
  }

  const details = [
    pageResult.published ? `${pageResult.published} publicada${pageResult.published === 1 ? "" : "s"}` : "",
    pageResult.retriesScheduled ? `${pageResult.retriesScheduled} en reintento seguro` : "",
    pageResult.reviewRequired ? `${pageResult.reviewRequired} requiere${pageResult.reviewRequired === 1 ? "" : "n"} revisión` : "",
    pageResult.failed ? `${pageResult.failed} con error` : "",
  ].filter(Boolean);

  return {
    ok: true,
    processed: pageResult.dueProcessed + pageResult.retryReleased,
    published: pageResult.published,
    failed: pageResult.failed,
    message: details.length ? `Scheduler terminado: ${details.join(" · ")}.` : "Scheduler terminado: no había publicaciones pendientes de acción.",
  };
}

function revalidateQueueViews() {
  revalidatePath("/");
  revalidatePath("/bulk-schedule");
  revalidatePath("/queue");
  revalidatePath("/library");
  revalidatePath("/settings");
}
