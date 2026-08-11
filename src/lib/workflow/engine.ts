import { createClient } from "@/lib/supabase/server";
import {
  buildImagePrompt,
  createImageStoragePath,
  generateImageWithReferences,
} from "@/lib/ai/generate-image";
import { reviewPostQuality } from "@/lib/ai/review-post";

const GENERATED_BUCKET = "generated-post-images";
const STYLE_BUCKET = "style-references";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

export type WorkflowOutcome =
  | { state: "waiting_external_image" }
  | { state: "waiting_approval"; reviewId: string; score: number; recommendation: "approve" | "revise" }
  | { state: "approved"; reviewId: string; score: number }
  | { state: "completed" }
  | { state: "failed"; error: string };

export async function ensureGenerationRun(supabase: SupabaseClient, userId: string, postId: string) {
  const { data: existing } = await supabase
    .from("generation_runs")
    .select("id")
    .eq("post_id", postId)
    .eq("owner_id", userId)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) return existing;

  const { data: created, error } = await supabase
    .from("generation_runs")
    .insert({
      owner_id: userId,
      post_id: postId,
      provider: "openai-compatible",
      model: process.env.AI_MODEL || "gpt-4.1-mini",
      current_step: "workflow",
      status: "running",
    })
    .select("id")
    .single();

  if (error || !created) throw new Error("No pudimos registrar la ejecución del workflow.");
  return created;
}

async function addLog(
  supabase: SupabaseClient,
  userId: string,
  postId: string,
  step: string,
  message: string,
  payload: Record<string, unknown> = {},
) {
  const run = await ensureGenerationRun(supabase, userId, postId);
  await supabase.from("generation_logs").insert({
    owner_id: userId,
    run_id: run.id,
    post_id: postId,
    step,
    message,
    payload,
  });
}

export async function executeImageStep(supabase: SupabaseClient, userId: string, postId: string) {
  const { data: post } = await supabase
    .from("posts")
    .select("id,topic,figure_name,intention,selected_style_id,selected_style_reason,page_id")
    .eq("id", postId)
    .eq("owner_id", userId)
    .maybeSingle();

  if (!post) throw new Error("No encontramos el post para generar imagen.");

  const { data: page } = await supabase
    .from("pages")
    .select("name")
    .eq("id", post.page_id)
    .eq("owner_id", userId)
    .maybeSingle();

  const { data: content } = await supabase
    .from("post_content")
    .select("eyebrow,title,subtitle,prayer_text,caption,cta")
    .eq("post_id", post.id)
    .eq("owner_id", userId)
    .eq("is_selected", true)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: style } = post.selected_style_id
    ? await supabase
        .from("visual_styles")
        .select("id,name,category,mood,description,usage_rules,color_notes,layout_notes,suggested_topics,suggested_figures")
        .eq("id", post.selected_style_id)
        .eq("owner_id", userId)
        .maybeSingle()
    : { data: null };

  const { data: referenceRows } = style
    ? await supabase
        .from("style_references")
        .select("storage_path,original_filename,is_primary,sort_order")
        .eq("style_id", style.id)
        .eq("owner_id", userId)
        .order("is_primary", { ascending: false })
        .order("sort_order", { ascending: true })
        .limit(4)
    : { data: [] };

  if (!page || !content || !style) throw new Error("Falta contenido o estilo para generar la imagen.");

  await supabase
    .from("posts")
    .update({
      status: "generating_image",
      image_source_mode: "api",
      workflow_step: "image",
      workflow_status: "running",
      workflow_error: "",
    })
    .eq("id", post.id)
    .eq("owner_id", userId);

  const { data: latestImage } = await supabase
    .from("post_images")
    .select("version")
    .eq("post_id", post.id)
    .eq("owner_id", userId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextVersion = (latestImage?.version ?? 0) + 1;
  const prompt = buildImagePrompt({
    pageName: page.name,
    post: {
      topic: post.topic,
      figureName: post.figure_name,
      intention: post.intention,
      selectedStyleReason: post.selected_style_reason,
    },
    text: {
      eyebrow: content.eyebrow,
      title: content.title,
      subtitle: content.subtitle,
      prayerText: content.prayer_text,
      caption: content.caption,
      cta: content.cta,
    },
    style: {
      id: style.id,
      name: style.name,
      category: style.category,
      mood: style.mood,
      description: style.description,
      usageRules: style.usage_rules,
      colorNotes: style.color_notes,
      layoutNotes: style.layout_notes,
      suggestedTopics: style.suggested_topics ?? [],
      suggestedFigures: style.suggested_figures ?? [],
    },
  });

  await addLog(supabase, userId, post.id, "workflow_image_start", "Iniciando generación de imagen dentro del workflow", {
    version: nextVersion,
    referenceCount: referenceRows?.length ?? 0,
  });

  const referenceInputs: Array<{ blob: Blob; filename: string }> = [];
  for (const reference of referenceRows ?? []) {
    const { data: blob, error: downloadError } = await supabase.storage.from(STYLE_BUCKET).download(reference.storage_path);
    if (downloadError || !blob) throw new Error(`No pudimos leer la referencia visual ${reference.original_filename}.`);
    referenceInputs.push({ blob, filename: reference.original_filename || "reference.png" });
  }

  const imageResponse = await generateImageWithReferences(prompt, referenceInputs);
  const storagePath = createImageStoragePath({ userId, postId: post.id, extension: imageResponse.extension });

  const upload = await supabase.storage.from(GENERATED_BUCKET).upload(storagePath, imageResponse.bytes, {
    contentType: imageResponse.mimeType,
    upsert: false,
  });
  if (upload.error) throw new Error(`No pudimos guardar la imagen en Storage: ${upload.error.message}`);

  await supabase.from("post_images").update({ is_selected: false }).eq("post_id", post.id).eq("owner_id", userId).eq("is_selected", true);

  const { data: imageRow, error: imageError } = await supabase
    .from("post_images")
    .insert({
      owner_id: userId,
      post_id: post.id,
      version: nextVersion,
      is_selected: true,
      status: "ready",
      source: "api",
      original_filename: "",
      prompt,
      revised_prompt: imageResponse.revisedPrompt,
      storage_path: storagePath,
      mime_type: imageResponse.mimeType,
      byte_size: imageResponse.bytes.length,
    })
    .select("id,version")
    .single();

  if (imageError || !imageRow) throw new Error("La imagen se generó, pero no pudimos registrarla.");

  await supabase
    .from("posts")
    .update({ status: "image_ready", workflow_step: "review", workflow_status: "running" })
    .eq("id", post.id)
    .eq("owner_id", userId);

  await addLog(supabase, userId, post.id, "workflow_image_completed", "Imagen generada y seleccionada por el workflow", {
    imageId: imageRow.id,
    version: imageRow.version,
  });

  return imageRow;
}

export async function executeQaStep(supabase: SupabaseClient, userId: string, postId: string) {
  const { data: post } = await supabase
    .from("posts")
    .select("id,topic,figure_name,intention,selected_style_id,selected_style_reason,page_id")
    .eq("id", postId)
    .eq("owner_id", userId)
    .maybeSingle();
  if (!post) throw new Error("No encontramos el post para revisar.");

  const { data: page } = await supabase
    .from("pages")
    .select("brand_tone")
    .eq("id", post.page_id)
    .eq("owner_id", userId)
    .maybeSingle();

  const { data: content } = await supabase
    .from("post_content")
    .select("eyebrow,title,subtitle,prayer_text,caption,cta,hashtags")
    .eq("post_id", post.id)
    .eq("owner_id", userId)
    .eq("is_selected", true)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: style } = post.selected_style_id
    ? await supabase
        .from("visual_styles")
        .select("id,name,category,mood")
        .eq("id", post.selected_style_id)
        .eq("owner_id", userId)
        .maybeSingle()
    : { data: null };

  const { data: selectedImage } = await supabase
    .from("post_images")
    .select("id,prompt")
    .eq("post_id", post.id)
    .eq("owner_id", userId)
    .eq("is_selected", true)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!page || !content || !style || !selectedImage) throw new Error("Falta información o imagen para ejecutar QA.");

  const { data: existingReview } = await supabase
    .from("qa_reviews")
    .select("id,version,review_status,recommended_decision,final_decision,overall_score")
    .eq("post_id", post.id)
    .eq("post_image_id", selectedImage.id)
    .eq("owner_id", userId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingReview?.review_status === "completed") return existingReview;

  const { data: latestReview } = await supabase
    .from("qa_reviews")
    .select("version")
    .eq("post_id", post.id)
    .eq("owner_id", userId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  const reviewVersion = (latestReview?.version ?? 0) + 1;

  await supabase
    .from("posts")
    .update({ workflow_step: "review", workflow_status: "running", workflow_error: "" })
    .eq("id", post.id)
    .eq("owner_id", userId);

  const { data: reviewRow, error: reviewError } = await supabase
    .from("qa_reviews")
    .insert({
      owner_id: userId,
      post_id: post.id,
      post_image_id: selectedImage.id,
      version: reviewVersion,
      review_status: "running",
      recommended_decision: "revise",
      final_decision: "pending",
    })
    .select("id")
    .single();
  if (reviewError || !reviewRow) throw new Error("No pudimos crear la revisión QA.");

  await addLog(supabase, userId, post.id, "workflow_qa_start", "Iniciando QA dentro del workflow", { reviewVersion });

  const review = await reviewPostQuality({
    brandTone: page.brand_tone,
    topic: post.topic,
    figureName: post.figure_name,
    intention: post.intention,
    styleName: style.name,
    styleCategory: style.category,
    styleMood: style.mood,
    styleReason: post.selected_style_reason,
    eyebrow: content.eyebrow,
    title: content.title,
    subtitle: content.subtitle,
    prayerText: content.prayer_text,
    caption: content.caption,
    cta: content.cta,
    hashtags: content.hashtags ?? [],
    imagePrompt: selectedImage.prompt || "",
    hasImage: true,
  });

  await supabase
    .from("qa_reviews")
    .update({
      review_status: "completed",
      recommended_decision: review.result.recommended_decision,
      final_decision: "pending",
      overall_score: review.result.overall_score,
      content_score: review.result.content_score,
      brand_score: review.result.brand_score,
      visual_score: review.result.visual_score,
      summary: review.result.summary,
      strengths: review.result.strengths,
      issues: review.result.issues,
      recommendations: review.result.recommendations,
    })
    .eq("id", reviewRow.id)
    .eq("owner_id", userId);

  await supabase
    .from("posts")
    .update({ status: "reviewed", workflow_step: "approval", workflow_status: "waiting" })
    .eq("id", post.id)
    .eq("owner_id", userId);

  await addLog(supabase, userId, post.id, "workflow_qa_completed", "QA completado por el workflow", {
    reviewId: reviewRow.id,
    score: review.result.overall_score,
    recommendation: review.result.recommended_decision,
  });

  return {
    id: reviewRow.id,
    version: reviewVersion,
    review_status: "completed",
    recommended_decision: review.result.recommended_decision,
    final_decision: "pending",
    overall_score: review.result.overall_score,
  };
}

export async function continueWorkflow(supabase: SupabaseClient, userId: string, postId: string): Promise<WorkflowOutcome> {
  try {
    const { data: post } = await supabase
      .from("posts")
      .select("id,workflow_mode,image_source_mode,status,page_id")
      .eq("id", postId)
      .eq("owner_id", userId)
      .maybeSingle();
    if (!post) throw new Error("No encontramos el post para continuar el workflow.");

    const { data: page } = await supabase
      .from("pages")
      .select("auto_approve_min_score")
      .eq("id", post.page_id)
      .eq("owner_id", userId)
      .maybeSingle();
    const minScore = page?.auto_approve_min_score ?? 90;

    await supabase
      .from("posts")
      .update({
        workflow_status: "running",
        workflow_error: "",
        workflow_started_at: new Date().toISOString(),
      })
      .eq("id", post.id)
      .eq("owner_id", userId);

    let { data: selectedImage } = await supabase
      .from("post_images")
      .select("id")
      .eq("post_id", post.id)
      .eq("owner_id", userId)
      .eq("is_selected", true)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!selectedImage) {
      if (post.image_source_mode === "external") {
        await supabase
          .from("posts")
          .update({
            status: "awaiting_external_image",
            workflow_step: "waiting_image",
            workflow_status: "waiting",
          })
          .eq("id", post.id)
          .eq("owner_id", userId);
        await addLog(supabase, userId, post.id, "workflow_waiting_image", "El workflow espera una imagen externa / ChatGPT");
        return { state: "waiting_external_image" };
      }

      await executeImageStep(supabase, userId, post.id);
      const selected = await supabase
        .from("post_images")
        .select("id")
        .eq("post_id", post.id)
        .eq("owner_id", userId)
        .eq("is_selected", true)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
      selectedImage = selected.data;
    }

    if (!selectedImage) throw new Error("El workflow no pudo resolver una imagen seleccionada.");

    const review = await executeQaStep(supabase, userId, post.id);

    if (post.workflow_mode === "automatic" && review.recommended_decision === "approve" && review.overall_score >= minScore) {
      await supabase
        .from("qa_reviews")
        .update({ final_decision: "approved" })
        .eq("id", review.id)
        .eq("owner_id", userId);
      await supabase
        .from("posts")
        .update({
          status: "approved",
          workflow_step: "completed",
          workflow_status: "completed",
          workflow_completed_at: new Date().toISOString(),
        })
        .eq("id", post.id)
        .eq("owner_id", userId);
      await addLog(supabase, userId, post.id, "workflow_auto_approved", "Post autoaprobado por el workflow", {
        reviewId: review.id,
        score: review.overall_score,
        minScore,
      });
      return { state: "approved", reviewId: review.id, score: review.overall_score };
    }

    await supabase
      .from("posts")
      .update({ workflow_step: "approval", workflow_status: "waiting" })
      .eq("id", post.id)
      .eq("owner_id", userId);

    return {
      state: "waiting_approval",
      reviewId: review.id,
      score: review.overall_score,
      recommendation: review.recommended_decision,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido del workflow.";
    await supabase
      .from("posts")
      .update({
        workflow_step: "failed",
        workflow_status: "failed",
        workflow_error: message,
        status: "failed",
      })
      .eq("id", postId)
      .eq("owner_id", userId);
    await addLog(supabase, userId, postId, "workflow_failed", message);
    return { state: "failed", error: message };
  }
}
