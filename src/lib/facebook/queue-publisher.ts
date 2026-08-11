import type { SupabaseClient } from "@supabase/supabase-js";
import { FacebookApiError, publishFacebookPhoto } from "@/lib/facebook/client";
import {
  FacebookConnectionError,
  getFacebookPublishingCredentials,
  markFacebookReconnectRequired,
  refreshFacebookPageToken,
} from "@/lib/facebook/connection";
import { classifyFacebookFailure, getRetryAt, MAX_AUTO_RETRIES } from "@/lib/scheduling/recovery";

const BUCKET = "generated-post-images";

type PublishQueueResult =
  | { ok: true; queueId: string; postId: string; photoId: string; message: string }
  | {
      ok: false;
      queueId: string;
      error: string;
      connectionIssue?: boolean;
      retryScheduled?: boolean;
      reviewRequired?: boolean;
    };

export async function publishQueueItem(input: {
  supabase: SupabaseClient;
  itemId: string;
  ownerId?: string;
  pageId?: string;
}): Promise<PublishQueueResult> {
  let query = input.supabase
    .from("publication_queue")
    .select("id,owner_id,page_id,storage_path,original_filename,mime_type,caption,status,attempts,retry_count,facebook_post_id")
    .eq("id", input.itemId);

  if (input.ownerId) query = query.eq("owner_id", input.ownerId);
  if (input.pageId) query = query.eq("page_id", input.pageId);

  const { data: item, error: itemError } = await query.maybeSingle();

  if (itemError || !item) {
    return { ok: false, queueId: input.itemId, error: itemError?.message || "No encontramos la publicación." };
  }

  if (item.status === "published" || item.facebook_post_id) {
    return {
      ok: true,
      queueId: item.id,
      postId: item.facebook_post_id,
      photoId: "",
      message: "La publicación ya estaba marcada como publicada.",
    };
  }

  if (item.status !== "ready_to_publish") {
    return { ok: false, queueId: item.id, error: "La publicación todavía no está lista para enviarse a Facebook." };
  }

  let credentials: Awaited<ReturnType<typeof getFacebookPublishingCredentials>>;
  try {
    credentials = await getFacebookPublishingCredentials({
      supabase: input.supabase,
      ownerId: item.owner_id,
      pageId: item.page_id,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Facebook no está conectado.";
    return {
      ok: false,
      queueId: item.id,
      error: message,
      connectionIssue: error instanceof FacebookConnectionError,
    };
  }

  const attempt = Number(item.attempts ?? 0) + 1;
  const retryCount = Number(item.retry_count ?? 0);
  const attemptAt = new Date().toISOString();

  const { data: claimed, error: claimError } = await input.supabase
    .from("publication_queue")
    .update({
      status: "publishing",
      attempts: attempt,
      last_attempt_at: attemptAt,
      publishing_started_at: attemptAt,
      last_error: "",
      next_retry_at: null,
    })
    .eq("id", item.id)
    .eq("status", "ready_to_publish")
    .select("id")
    .maybeSingle();

  if (claimError) {
    return { ok: false, queueId: item.id, error: `No pudimos bloquear la publicación: ${claimError.message}` };
  }

  if (!claimed) {
    return { ok: false, queueId: item.id, error: "La publicación ya está siendo procesada por otro proceso." };
  }

  const { data: imageBlob, error: downloadError } = await input.supabase.storage.from(BUCKET).download(item.storage_path);
  if (downloadError || !imageBlob) {
    const message = `No pudimos leer la imagen desde Storage: ${downloadError?.message || "archivo no disponible"}`;
    const canRetry = retryCount < MAX_AUTO_RETRIES;
    const nextRetryCount = retryCount + 1;

    await input.supabase
      .from("publication_queue")
      .update({
        status: canRetry ? "retry_wait" : "failed",
        retry_count: nextRetryCount,
        next_retry_at: canRetry ? getRetryAt(retryCount) : null,
        failure_kind: canRetry ? "transient" : "permanent",
        last_error: canRetry
          ? `${message}. Se reintentará automáticamente porque la imagen todavía no se envió a Facebook.`
          : `${message}. Se alcanzó el máximo de reintentos automáticos.`,
        last_error_code: "storage_download",
        last_http_status: null,
        publishing_started_at: null,
      })
      .eq("id", item.id);

    await input.supabase.from("facebook_publish_logs").insert({
      owner_id: item.owner_id,
      page_id: item.page_id,
      queue_id: item.id,
      attempt,
      success: false,
      error_code: "storage_download",
      error_message: message,
      response_payload: { retryScheduled: canRetry },
    });

    return {
      ok: false,
      queueId: item.id,
      error: canRetry ? "La imagen no pudo leerse temporalmente. Se programó un reintento seguro." : message,
      retryScheduled: canRetry,
    };
  }

  try {
    const facebook = await publishFacebookPhoto({
      pageId: credentials.pageId,
      accessToken: credentials.accessToken,
      image: imageBlob,
      filename: item.original_filename || "post-image.png",
      caption: item.caption || "",
    });

    const publishedAt = new Date().toISOString();
    const { error: updateError } = await input.supabase
      .from("publication_queue")
      .update({
        status: "published",
        facebook_post_id: facebook.postId,
        facebook_photo_id: facebook.photoId,
        published_at: publishedAt,
        last_error: "",
        failure_kind: "",
        last_error_code: "",
        last_http_status: facebook.httpStatus,
        next_retry_at: null,
        publishing_started_at: null,
        manual_resolution: "",
      })
      .eq("id", item.id);

    await input.supabase.from("facebook_publish_logs").insert({
      owner_id: item.owner_id,
      page_id: item.page_id,
      queue_id: item.id,
      attempt,
      success: true,
      http_status: facebook.httpStatus,
      facebook_post_id: facebook.postId,
      facebook_photo_id: facebook.photoId,
      response_payload: facebook.payload,
    });

    if (updateError) {
      await input.supabase
        .from("publication_queue")
        .update({
          status: "needs_review",
          facebook_post_id: facebook.postId,
          facebook_photo_id: facebook.photoId,
          published_at: publishedAt,
          failure_kind: "ambiguous",
          last_error: `Facebook devolvió éxito (${facebook.postId}), pero la app no pudo guardar el estado local de forma normal. Verifica Facebook y marca la publicación como resuelta.`,
          publishing_started_at: null,
        })
        .eq("id", item.id);

      return {
        ok: false,
        queueId: item.id,
        error: `Facebook sí publicó la imagen (${facebook.postId}), pero la app no pudo guardar el estado local. No la reintentes hasta verificar Facebook. Detalle: ${updateError.message}`,
        reviewRequired: true,
      };
    }

    return {
      ok: true,
      queueId: item.id,
      postId: facebook.postId,
      photoId: facebook.photoId,
      message: "Imagen publicada correctamente en Facebook.",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido al publicar en Facebook.";
    const facebookError = error instanceof FacebookApiError ? error : null;
    const decision = classifyFacebookFailure(error, retryCount);

    if (decision.kind === "connection") {
      try {
        await refreshFacebookPageToken({
          supabase: input.supabase,
          ownerId: item.owner_id,
          pageId: item.page_id,
        });

        const retryAt = new Date(Date.now() + 60_000).toISOString();
        await input.supabase
          .from("publication_queue")
          .update({
            status: "retry_wait",
            next_retry_at: retryAt,
            failure_kind: "connection",
            last_error: "El Page Access Token se renovó automáticamente. Se reintentará en el siguiente ciclo.",
            last_error_code: facebookError?.errorCode ?? "190",
            last_http_status: facebookError?.httpStatus ?? null,
            publishing_started_at: null,
          })
          .eq("id", item.id);

        await logFailure(input.supabase, item, attempt, facebookError, message, { tokenRecovered: true, retryAt });

        return {
          ok: false,
          queueId: item.id,
          error: "Facebook rechazó el token de Página, pero la app lo renovó automáticamente. Se programó un nuevo intento.",
          connectionIssue: true,
          retryScheduled: true,
        };
      } catch (refreshError) {
        const reconnectMessage = refreshError instanceof Error ? refreshError.message : message;
        await markFacebookReconnectRequired({
          supabase: input.supabase,
          ownerId: item.owner_id,
          pageId: item.page_id,
          error: reconnectMessage,
        });

        await input.supabase
          .from("publication_queue")
          .update({
            status: "ready_to_publish",
            failure_kind: "connection",
            last_error: `Facebook requiere reconexión. La publicación se mantiene en cola. ${reconnectMessage}`,
            last_error_code: facebookError?.errorCode ?? "190",
            last_http_status: facebookError?.httpStatus ?? null,
            publishing_started_at: null,
          })
          .eq("id", item.id);

        await logFailure(input.supabase, item, attempt, facebookError, message, { reconnectRequired: true });

        return {
          ok: false,
          queueId: item.id,
          error: `Facebook requiere reconexión. La publicación se mantuvo en cola. ${reconnectMessage}`,
          connectionIssue: true,
        };
      }
    }

    const nextRetryCount = decision.autoRetry ? retryCount + 1 : retryCount;
    const nextStatus = decision.autoRetry ? "retry_wait" : decision.kind === "ambiguous" ? "needs_review" : "failed";

    await input.supabase
      .from("publication_queue")
      .update({
        status: nextStatus,
        retry_count: nextRetryCount,
        next_retry_at: decision.retryAt,
        failure_kind: decision.kind,
        last_error: `${decision.userMessage} Detalle: ${message}`,
        last_error_code: facebookError?.errorCode ?? "",
        last_http_status: facebookError?.httpStatus ?? null,
        publishing_started_at: null,
      })
      .eq("id", item.id);

    await logFailure(input.supabase, item, attempt, facebookError, message, {
      failureKind: decision.kind,
      retryScheduled: decision.autoRetry,
      retryAt: decision.retryAt,
    });

    return {
      ok: false,
      queueId: item.id,
      error: decision.userMessage,
      retryScheduled: decision.autoRetry,
      reviewRequired: decision.kind === "ambiguous",
    };
  }
}

async function logFailure(
  supabase: SupabaseClient,
  item: { id: string; owner_id: string; page_id: string },
  attempt: number,
  facebookError: FacebookApiError | null,
  message: string,
  extra: Record<string, unknown>,
) {
  await supabase.from("facebook_publish_logs").insert({
    owner_id: item.owner_id,
    page_id: item.page_id,
    queue_id: item.id,
    attempt,
    success: false,
    http_status: facebookError?.httpStatus ?? null,
    error_code: facebookError?.errorCode ?? "",
    error_message: message,
    response_payload: {
      ...(facebookError?.payload ?? {}),
      recovery: extra,
    },
  });
}
