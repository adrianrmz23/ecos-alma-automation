"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

async function getContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false as const, error: "Tu sesión expiró. Vuelve a iniciar sesión." };

  const { data: page } = await supabase
    .from("pages")
    .select("id")
    .eq("owner_id", user.id)
    .eq("slug", "ecos-del-alma")
    .maybeSingle();

  if (!page) return { ok: false as const, error: "No encontramos la configuración de Ecos del Alma." };
  return { ok: true as const, supabase, user, page };
}

export async function retryHistoryItem(input: { itemId: string; confirmedNotPublished?: boolean }) {
  const context = await getContext();
  if (!context.ok) return context;

  const { supabase, user, page } = context;
  const { data: item } = await supabase
    .from("publication_queue")
    .select("id,status,failure_kind")
    .eq("id", input.itemId)
    .eq("owner_id", user.id)
    .eq("page_id", page.id)
    .maybeSingle();

  if (!item) return { ok: false as const, error: "No encontramos esa publicación." };
  if (!["failed", "needs_review"].includes(item.status)) {
    return { ok: false as const, error: "Esta publicación no puede reintentarse desde Historial." };
  }

  if (item.status === "needs_review" && !input.confirmedNotPublished) {
    return {
      ok: false as const,
      error: "Antes de reintentar debes confirmar que revisaste Facebook y que la imagen NO se publicó.",
    };
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("publication_queue")
    .update({
      status: "ready_to_publish",
      ready_at: now,
      next_retry_at: null,
      retry_count: 0,
      failure_kind: "",
      last_error: item.status === "needs_review"
        ? "Reintento autorizado manualmente después de verificar que Facebook no publicó la imagen."
        : "Reintento solicitado manualmente desde Historial.",
      manual_resolution: item.status === "needs_review" ? "confirmed_not_published" : "manual_retry",
      publishing_started_at: null,
    })
    .eq("id", item.id)
    .eq("owner_id", user.id);

  if (error) return { ok: false as const, error: `No pudimos devolverla a la cola: ${error.message}` };
  revalidateAll();
  return { ok: true as const, message: "La publicación volvió a la cola y está lista para un nuevo intento." };
}

export async function markHistoryItemPublished(itemId: string) {
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

  if (!item) return { ok: false as const, error: "No encontramos esa publicación." };
  if (item.status !== "needs_review") {
    return { ok: false as const, error: "Solo una publicación en revisión puede resolverse manualmente como publicada." };
  }

  const { error } = await supabase
    .from("publication_queue")
    .update({
      status: "published",
      published_at: new Date().toISOString(),
      failure_kind: "",
      next_retry_at: null,
      publishing_started_at: null,
      manual_resolution: "verified_published",
      last_error: "",
    })
    .eq("id", item.id)
    .eq("owner_id", user.id);

  if (error) return { ok: false as const, error: `No pudimos resolverla: ${error.message}` };
  revalidateAll();
  return { ok: true as const, message: "Marcada como publicada después de tu verificación manual." };
}

export async function cancelHistoryItem(itemId: string) {
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

  if (!item) return { ok: false as const, error: "No encontramos esa publicación." };
  if (!["failed", "needs_review"].includes(item.status)) {
    return { ok: false as const, error: "Esta publicación ya no puede archivarse como cancelada." };
  }

  const { error } = await supabase
    .from("publication_queue")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      next_retry_at: null,
      publishing_started_at: null,
      manual_resolution: "cancelled_after_failure",
    })
    .eq("id", item.id)
    .eq("owner_id", user.id);

  if (error) return { ok: false as const, error: `No pudimos cancelar: ${error.message}` };
  revalidateAll();
  return { ok: true as const, message: "Publicación archivada como cancelada." };
}

function revalidateAll() {
  revalidatePath("/");
  revalidatePath("/queue");
  revalidatePath("/library");
}
