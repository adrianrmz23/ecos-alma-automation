"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  continueWorkflow,
  ensureGenerationRun,
  executeImageStep,
} from "@/lib/workflow/engine";

const GENERATED_BUCKET = "generated-post-images";

async function getAuthContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

function outcomeQuery(outcome: Awaited<ReturnType<typeof continueWorkflow>>) {
  if (outcome.state === "waiting_external_image") return "workflow=waiting_image";
  if (outcome.state === "waiting_approval") return "workflow=waiting_approval";
  if (outcome.state === "approved") return "workflow=approved";
  if (outcome.state === "failed") return `error=${encodeURIComponent(outcome.error)}`;
  return "workflow=advanced";
}

export async function generateImageForPost(formData: FormData) {
  const postId = String(formData.get("post_id") ?? "").trim();
  if (!postId) redirect("/library");

  const { supabase, user } = await getAuthContext();

  try {
    await executeImageStep(supabase, user.id, postId);
    const outcome = await continueWorkflow(supabase, user.id, postId);

    revalidatePath("/");
    revalidatePath("/library");
    revalidatePath(`/generate/${postId}`);
    redirect(`/generate/${postId}?${outcomeQuery(outcome)}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido al generar la imagen.";
    await supabase
      .from("posts")
      .update({ status: "failed", workflow_step: "failed", workflow_status: "failed", workflow_error: message })
      .eq("id", postId)
      .eq("owner_id", user.id);
    redirect(`/generate/${postId}?error=${encodeURIComponent(message)}`);
  }
}

export async function registerExternalImage(input: {
  postId: string;
  storagePath: string;
  mimeType: string;
  byteSize: number;
  originalFilename: string;
}) {
  const { supabase, user } = await getAuthContext();

  const { data: post } = await supabase
    .from("posts")
    .select("id,image_source_mode")
    .eq("id", input.postId)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!post) throw new Error("No encontramos el post para registrar la imagen.");

  const expectedPrefix = `${user.id}/${post.id}/`;
  if (!input.storagePath.startsWith(expectedPrefix)) throw new Error("La ruta de Storage no pertenece a este post.");

  const { data: latestImage } = await supabase
    .from("post_images")
    .select("version")
    .eq("post_id", post.id)
    .eq("owner_id", user.id)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextVersion = (latestImage?.version ?? 0) + 1;

  await supabase.from("post_images").update({ is_selected: false }).eq("post_id", post.id).eq("owner_id", user.id).eq("is_selected", true);

  const { data: imageRow, error: insertError } = await supabase
    .from("post_images")
    .insert({
      owner_id: user.id,
      post_id: post.id,
      version: nextVersion,
      is_selected: true,
      status: "ready",
      source: "upload",
      original_filename: input.originalFilename,
      prompt: "Imagen externa generada fuera del API y cargada manualmente.",
      revised_prompt: "",
      storage_path: input.storagePath,
      mime_type: input.mimeType,
      byte_size: input.byteSize,
    })
    .select("id")
    .single();
  if (insertError || !imageRow) throw new Error(`No pudimos registrar la imagen: ${insertError?.message || "error desconocido"}`);

  await supabase
    .from("posts")
    .update({
      image_source_mode: "external",
      status: "image_ready",
      workflow_step: "review",
      workflow_status: "running",
      workflow_error: "",
    })
    .eq("id", post.id)
    .eq("owner_id", user.id);

  const run = await ensureGenerationRun(supabase, user.id, post.id);
  await supabase.from("generation_logs").insert({
    owner_id: user.id,
    run_id: run.id,
    post_id: post.id,
    step: "external_image_upload",
    message: "Imagen externa cargada; el workflow reanuda desde QA",
    payload: { version: nextVersion, imageId: imageRow.id, originalFilename: input.originalFilename },
  });

  const outcome = await continueWorkflow(supabase, user.id, post.id);

  revalidatePath("/");
  revalidatePath("/library");
  revalidatePath(`/generate/${post.id}`);
  return { ok: true, outcome };
}

export async function runQaReview(formData: FormData) {
  const postId = String(formData.get("post_id") ?? "").trim();
  if (!postId) redirect("/library");

  const { supabase, user } = await getAuthContext();
  const outcome = await continueWorkflow(supabase, user.id, postId);

  revalidatePath("/");
  revalidatePath("/library");
  revalidatePath(`/generate/${postId}`);
  redirect(`/generate/${postId}?${outcomeQuery(outcome)}`);
}

export async function approvePost(formData: FormData) {
  await setDecision(formData, "approved");
}

export async function rejectPost(formData: FormData) {
  await setDecision(formData, "rejected");
}

async function setDecision(formData: FormData, decision: "approved" | "rejected") {
  const postId = String(formData.get("post_id") ?? "").trim();
  const reviewId = String(formData.get("review_id") ?? "").trim();
  if (!postId || !reviewId) redirect("/library");

  const { supabase, user } = await getAuthContext();

  const { data: post } = await supabase
    .from("posts")
    .select("id,image_source_mode")
    .eq("id", postId)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!post) redirect("/library");

  const { data: review } = await supabase
    .from("qa_reviews")
    .select("id,post_id")
    .eq("id", reviewId)
    .eq("post_id", postId)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!review) redirect("/library");

  await supabase.from("qa_reviews").update({ final_decision: decision }).eq("id", review.id).eq("owner_id", user.id);

  if (decision === "approved") {
    await supabase
      .from("posts")
      .update({
        status: "approved",
        workflow_step: "completed",
        workflow_status: "completed",
        workflow_error: "",
        workflow_completed_at: new Date().toISOString(),
      })
      .eq("id", postId)
      .eq("owner_id", user.id);
  } else {
    await supabase
      .from("posts")
      .update({
        status: "rejected",
        workflow_step: post.image_source_mode === "external" ? "waiting_image" : "image",
        workflow_status: "waiting",
        workflow_error: "",
      })
      .eq("id", postId)
      .eq("owner_id", user.id);
  }

  const run = await ensureGenerationRun(supabase, user.id, postId);
  await supabase.from("generation_logs").insert({
    owner_id: user.id,
    run_id: run.id,
    post_id: postId,
    step: "workflow_manual_decision",
    message: decision === "approved" ? "Post aprobado manualmente; workflow completado" : "Post rechazado; workflow espera una nueva imagen",
    payload: { reviewId },
  });

  revalidatePath("/");
  revalidatePath("/library");
  revalidatePath(`/generate/${postId}`);
  redirect(`/generate/${postId}?decision=${decision}`);
}
