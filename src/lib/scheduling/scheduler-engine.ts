import type { SupabaseClient } from "@supabase/supabase-js";
import { publishQueueItem } from "@/lib/facebook/queue-publisher";

export type SchedulerTriggerSource = "manual" | "api" | "cron";

type SchedulerScope = {
  ownerId?: string;
  pageId?: string;
};

type PageRunResult = {
  ownerId: string;
  pageId: string;
  dueProcessed: number;
  retryReleased: number;
  staleReview: number;
  attempted: number;
  published: number;
  failed: number;
  retriesScheduled: number;
  reviewRequired: number;
  connectionIssues: number;
  durationMs: number;
  error?: string;
};

export async function runSchedulerEngine(input: {
  supabase: SupabaseClient;
  triggerSource: SchedulerTriggerSource;
  scope?: SchedulerScope;
}) {
  const startedAt = Date.now();
  let targetsQuery = input.supabase.from("pages").select("id,owner_id").eq("status", "active");

  if (input.scope?.ownerId) targetsQuery = targetsQuery.eq("owner_id", input.scope.ownerId);
  if (input.scope?.pageId) targetsQuery = targetsQuery.eq("id", input.scope.pageId);

  const { data: targets, error: targetError } = await targetsQuery.limit(200);
  if (targetError) throw new Error(`No pudimos consultar las páginas del scheduler: ${targetError.message}`);

  const results: PageRunResult[] = [];
  for (const target of targets ?? []) {
    results.push(
      await processPage({
        supabase: input.supabase,
        ownerId: target.owner_id,
        pageId: target.id,
        triggerSource: input.triggerSource,
      }),
    );
  }

  return {
    ok: results.every((result) => !result.error),
    pages: results.length,
    dueProcessed: results.reduce((sum, result) => sum + result.dueProcessed, 0),
    retryReleased: results.reduce((sum, result) => sum + result.retryReleased, 0),
    staleReview: results.reduce((sum, result) => sum + result.staleReview, 0),
    attempted: results.reduce((sum, result) => sum + result.attempted, 0),
    published: results.reduce((sum, result) => sum + result.published, 0),
    failed: results.reduce((sum, result) => sum + result.failed, 0),
    retriesScheduled: results.reduce((sum, result) => sum + result.retriesScheduled, 0),
    reviewRequired: results.reduce((sum, result) => sum + result.reviewRequired, 0),
    connectionIssues: results.reduce((sum, result) => sum + result.connectionIssues, 0),
    durationMs: Date.now() - startedAt,
    results,
  };
}

async function processPage(input: {
  supabase: SupabaseClient;
  ownerId: string;
  pageId: string;
  triggerSource: SchedulerTriggerSource;
}): Promise<PageRunResult> {
  const startedAtMs = Date.now();
  const startedAt = new Date().toISOString();
  const now = new Date();
  const nowIso = now.toISOString();
  const staleBeforeIso = new Date(now.getTime() - 10 * 60_000).toISOString();

  const result: PageRunResult = {
    ownerId: input.ownerId,
    pageId: input.pageId,
    dueProcessed: 0,
    retryReleased: 0,
    staleReview: 0,
    attempted: 0,
    published: 0,
    failed: 0,
    retriesScheduled: 0,
    reviewRequired: 0,
    connectionIssues: 0,
    durationMs: 0,
  };

  try {
    // Nunca reintentamos automáticamente un "publishing" abandonado: pudo llegar a Facebook.
    const { data: stalePublishing, error: staleError } = await input.supabase
      .from("publication_queue")
      .select("id")
      .eq("owner_id", input.ownerId)
      .eq("page_id", input.pageId)
      .eq("status", "publishing")
      .lt("publishing_started_at", staleBeforeIso)
      .limit(100);

    if (staleError) throw new Error(staleError.message);

    const staleIds = (stalePublishing ?? []).map((item) => item.id);
    if (staleIds.length > 0) {
      const { error } = await input.supabase
        .from("publication_queue")
        .update({
          status: "needs_review",
          failure_kind: "ambiguous",
          last_error: "El proceso de publicación quedó interrumpido. Verifica Facebook antes de reintentar para evitar duplicados.",
          next_retry_at: null,
          publishing_started_at: null,
        })
        .in("id", staleIds)
        .eq("status", "publishing");
      if (error) throw new Error(error.message);
      result.staleReview = staleIds.length;
      result.reviewRequired += staleIds.length;
    }

    const { data: dueItems, error: dueError } = await input.supabase
      .from("publication_queue")
      .select("id")
      .eq("owner_id", input.ownerId)
      .eq("page_id", input.pageId)
      .eq("status", "scheduled")
      .lte("scheduled_for", nowIso)
      .order("scheduled_for", { ascending: true })
      .limit(100);

    if (dueError) throw new Error(dueError.message);

    const dueIds = (dueItems ?? []).map((item) => item.id);
    if (dueIds.length > 0) {
      const { error } = await input.supabase
        .from("publication_queue")
        .update({ status: "ready_to_publish", ready_at: nowIso })
        .in("id", dueIds)
        .eq("status", "scheduled");
      if (error) throw new Error(error.message);
      result.dueProcessed = dueIds.length;
    }

    const { data: retryItems, error: retryError } = await input.supabase
      .from("publication_queue")
      .select("id")
      .eq("owner_id", input.ownerId)
      .eq("page_id", input.pageId)
      .eq("status", "retry_wait")
      .lte("next_retry_at", nowIso)
      .order("next_retry_at", { ascending: true })
      .limit(100);

    if (retryError) throw new Error(retryError.message);

    const retryIds = (retryItems ?? []).map((item) => item.id);
    if (retryIds.length > 0) {
      const { error } = await input.supabase
        .from("publication_queue")
        .update({ status: "ready_to_publish", ready_at: nowIso, next_retry_at: null })
        .in("id", retryIds)
        .eq("status", "retry_wait");
      if (error) throw new Error(error.message);
      result.retryReleased = retryIds.length;
    }

    const { data: readyItems, error: readyError } = await input.supabase
      .from("publication_queue")
      .select("id")
      .eq("owner_id", input.ownerId)
      .eq("page_id", input.pageId)
      .eq("status", "ready_to_publish")
      .order("scheduled_for", { ascending: true })
      .limit(3);

    if (readyError) throw new Error(readyError.message);

    for (const item of readyItems ?? []) {
      result.attempted += 1;
      const publishResult = await publishQueueItem({
        supabase: input.supabase,
        itemId: item.id,
        ownerId: input.ownerId,
        pageId: input.pageId,
      });

      if (publishResult.ok) {
        result.published += 1;
        continue;
      }

      if (publishResult.connectionIssue && !publishResult.retryScheduled) {
        result.connectionIssues += 1;
        break;
      }

      if (publishResult.retryScheduled) result.retriesScheduled += 1;
      else if (publishResult.reviewRequired) result.reviewRequired += 1;
      else result.failed += 1;
    }

    result.durationMs = Date.now() - startedAtMs;
    const runStatus = result.failed > 0 || result.reviewRequired > 0 || result.connectionIssues > 0 ? "partial" : "completed";

    await input.supabase.from("scheduler_runs").insert({
      owner_id: input.ownerId,
      page_id: input.pageId,
      trigger_source: input.triggerSource,
      processed_count: result.dueProcessed + result.retryReleased,
      published_count: result.published,
      failed_count: result.failed,
      retry_count: result.retriesScheduled,
      review_count: result.reviewRequired,
      duration_ms: result.durationMs,
      status: runStatus,
      started_at: startedAt,
      completed_at: new Date().toISOString(),
    });

    const { data: previousHealth } = await input.supabase
      .from("scheduler_health")
      .select("consecutive_failures,last_published_at")
      .eq("owner_id", input.ownerId)
      .eq("page_id", input.pageId)
      .maybeSingle();

    const healthy = runStatus === "completed";
    await input.supabase.from("scheduler_health").upsert(
      {
        owner_id: input.ownerId,
        page_id: input.pageId,
        status: healthy ? "healthy" : "warning",
        last_tick_at: new Date().toISOString(),
        last_success_at: healthy ? new Date().toISOString() : undefined,
        last_published_at: result.published > 0 ? new Date().toISOString() : previousHealth?.last_published_at ?? null,
        consecutive_failures: healthy ? 0 : Number(previousHealth?.consecutive_failures ?? 0) + 1,
        last_duration_ms: result.durationMs,
        last_error: healthy
          ? ""
          : result.connectionIssues
            ? "Facebook requiere atención antes de continuar."
            : result.reviewRequired
              ? "Hay publicaciones que requieren revisión manual para evitar duplicados."
              : "Una o más publicaciones no pudieron completarse.",
      },
      { onConflict: "owner_id,page_id" },
    );

    return result;
  } catch (error) {
    result.durationMs = Date.now() - startedAtMs;
    result.error = error instanceof Error ? error.message : "Error inesperado del scheduler.";

    const { data: previousHealth } = await input.supabase
      .from("scheduler_health")
      .select("consecutive_failures,last_published_at")
      .eq("owner_id", input.ownerId)
      .eq("page_id", input.pageId)
      .maybeSingle();

    await input.supabase.from("scheduler_runs").insert({
      owner_id: input.ownerId,
      page_id: input.pageId,
      trigger_source: input.triggerSource,
      processed_count: result.dueProcessed + result.retryReleased,
      published_count: result.published,
      failed_count: result.failed,
      retry_count: result.retriesScheduled,
      review_count: result.reviewRequired,
      duration_ms: result.durationMs,
      status: "failed",
      error_message: result.error,
      started_at: startedAt,
      completed_at: new Date().toISOString(),
    });

    await input.supabase.from("scheduler_health").upsert(
      {
        owner_id: input.ownerId,
        page_id: input.pageId,
        status: "error",
        last_tick_at: new Date().toISOString(),
        last_published_at: previousHealth?.last_published_at ?? null,
        consecutive_failures: Number(previousHealth?.consecutive_failures ?? 0) + 1,
        last_duration_ms: result.durationMs,
        last_error: result.error,
      },
      { onConflict: "owner_id,page_id" },
    );

    return result;
  }
}
