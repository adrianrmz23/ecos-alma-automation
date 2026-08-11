"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  generatePrayerContent,
  generateStrategy,
  type RecentPostSummary,
  type StyleOption,
} from "@/lib/ai/generate-post";
import { continueWorkflow, type WorkflowOutcome } from "@/lib/workflow/engine";

async function getSessionContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: page } = await supabase
    .from("pages")
    .select("id,name,brand_tone,default_reference_mode,default_workflow_mode,default_image_source_mode")
    .eq("owner_id", user.id)
    .eq("slug", "ecos-del-alma")
    .maybeSingle();

  if (!page) redirect("/settings");

  return { supabase, user, page };
}

async function logStep({
  supabase,
  userId,
  runId,
  postId,
  step,
  message,
  payload = {},
}: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  runId: string;
  postId: string;
  step: string;
  message: string;
  payload?: Record<string, unknown>;
}) {
  await supabase.from("generation_logs").insert({
    owner_id: userId,
    run_id: runId,
    post_id: postId,
    step,
    message,
    payload,
  });
}

export async function generatePost(formData: FormData) {
  const { supabase, user, page } = await getSessionContext();

  const topicHint = String(formData.get("topic_hint") ?? "").trim();
  const figureHint = String(formData.get("figure_hint") ?? "").trim();
  const intentionHint = String(formData.get("intention_hint") ?? "").trim();
  const lengthPreference = String(formData.get("length_preference") ?? "medium") as "short" | "medium" | "long";
  const additionalInstructions = String(formData.get("additional_instructions") ?? "").trim();
  const styleMode = String(formData.get("style_mode") ?? page.default_reference_mode ?? "automatic") as "automatic" | "manual";
  const workflowMode = String(formData.get("workflow_mode") ?? page.default_workflow_mode ?? "supervised") as "supervised" | "automatic";
  const imageSourceMode = String(formData.get("image_source_mode") ?? page.default_image_source_mode ?? "external") as "external" | "api";
  const selectedStyleIdInput = String(formData.get("selected_style_id") ?? "").trim() || null;

  const { data: rawStyles } = await supabase
    .from("visual_styles")
    .select("id,name,category,mood,description,usage_rules,color_notes,layout_notes,suggested_topics,suggested_figures,auto_select_enabled,active")
    .eq("owner_id", user.id)
    .eq("page_id", page.id)
    .eq("active", true)
    .order("name");

  const styleIds = (rawStyles ?? []).map((style) => style.id);
  const { data: refs } = styleIds.length
    ? await supabase
        .from("style_references")
        .select("style_id")
        .eq("owner_id", user.id)
        .in("style_id", styleIds)
    : { data: [] };

  const refCounts = new Map<string, number>();
  for (const ref of refs ?? []) {
    refCounts.set(ref.style_id, (refCounts.get(ref.style_id) ?? 0) + 1);
  }

  const styleCatalog = (rawStyles ?? [])
    .filter((style) => (refCounts.get(style.id) ?? 0) > 0)
    .map<StyleOption & { autoSelectEnabled: boolean }>((style) => ({
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
      autoSelectEnabled: style.auto_select_enabled,
    }));

  const automaticStyles = styleCatalog.filter((style) => style.autoSelectEnabled);
  const manualStyle = selectedStyleIdInput
    ? styleCatalog.find((style) => style.id === selectedStyleIdInput) ?? null
    : null;

  if (styleMode === "automatic" && automaticStyles.length === 0) {
    redirect("/generate?error=styles");
  }

  if (styleMode === "manual" && !manualStyle) {
    redirect("/generate?error=manual_style");
  }

  const { data: post, error: postError } = await supabase
    .from("posts")
    .insert({
      owner_id: user.id,
      page_id: page.id,
      type: "prayer",
      topic: topicHint,
      figure_name: figureHint,
      intention: intentionHint,
      length_preference: lengthPreference,
      workflow_mode: workflowMode,
      image_source_mode: imageSourceMode,
      style_mode: styleMode,
      selected_style_id: manualStyle?.id ?? null,
      additional_instructions: additionalInstructions,
      status: "generating_strategy",
      workflow_step: "strategy",
      workflow_status: "running",
      workflow_started_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (postError || !post) {
    redirect("/generate?error=save");
  }

  const postId = post.id;
  const providerModel = process.env.AI_MODEL || "gpt-4.1-mini";
  const { data: run, error: runError } = await supabase
    .from("generation_runs")
    .insert({
      owner_id: user.id,
      post_id: postId,
      provider: "openai-compatible",
      model: providerModel,
      current_step: "strategy",
      status: "running",
    })
    .select("id")
    .single();

  if (runError || !run) {
    await supabase.from("posts").update({ status: "failed", workflow_step: "failed", workflow_status: "failed", workflow_error: "No pudimos crear el registro de ejecución." }).eq("id", postId).eq("owner_id", user.id);
    redirect("/generate?error=save");
  }

  const { data: recentRaw } = await supabase
    .from("posts")
    .select("topic,figure_name,intention,created_at")
    .eq("owner_id", user.id)
    .neq("id", postId)
    .order("created_at", { ascending: false })
    .limit(8);

  const recentPosts: RecentPostSummary[] = (recentRaw ?? []).map((post) => ({
    topic: post.topic,
    figureName: post.figure_name,
    intention: post.intention,
    createdAt: new Date(post.created_at).toLocaleDateString("es-MX"),
  }));

  let workflowOutcome: WorkflowOutcome | null = null;

  try {
    if (!process.env.AI_API_KEY) {
      throw new Error("Falta AI_API_KEY en .env.local");
    }

    await logStep({
      supabase,
      userId: user.id,
      runId: run.id,
      postId,
      step: "strategy",
      message: "Iniciando estrategia editorial",
      payload: {
        styleMode,
        workflowMode,
        imageSourceMode,
        topicHint,
        figureHint,
        intentionHint,
      },
    });

    const strategyResponse = await generateStrategy({
      brandTone: page.brand_tone,
      topicHint,
      figureHint,
      intentionHint,
      lengthPreference,
      styleMode,
      manualStyle,
      availableStyles: styleMode === "automatic" ? automaticStyles : styleCatalog,
      recentPosts,
      additionalInstructions,
    });

    let selectedStyle = manualStyle;
    let selectedStyleReason = strategyResponse.result.selected_style_reason;
    let selectedStyleConfidence = Number(strategyResponse.result.selected_style_confidence ?? 0);

    if (styleMode === "automatic") {
      selectedStyle = automaticStyles.find((style) => style.id === strategyResponse.result.selected_style_id) ?? automaticStyles[0] ?? null;
      if (!selectedStyle) throw new Error("No pudimos resolver un estilo automático válido.");
      if (!selectedStyleReason) selectedStyleReason = `El estilo ${selectedStyle.name} fue seleccionado automáticamente.`;
    } else if (manualStyle) {
      selectedStyleReason = `Se utilizó el estilo manual elegido por el usuario: ${manualStyle.name}.`;
      selectedStyleConfidence = 1;
    }

    await supabase
      .from("posts")
      .update({
        topic: strategyResponse.result.topic,
        figure_name: strategyResponse.result.figure_name,
        intention: strategyResponse.result.intention,
        selected_style_id: selectedStyle?.id ?? null,
        selected_style_reason: selectedStyleReason,
        selected_style_confidence: selectedStyleConfidence,
        strategy_payload: strategyResponse.result,
        status: "generating_content",
        workflow_step: "content",
        workflow_status: "running",
      })
      .eq("id", postId)
      .eq("owner_id", user.id);

    await supabase
      .from("generation_runs")
      .update({ current_step: "content" })
      .eq("id", run.id)
      .eq("owner_id", user.id);

    await logStep({
      supabase,
      userId: user.id,
      runId: run.id,
      postId,
      step: "strategy",
      message: "Estrategia resuelta correctamente",
      payload: {
        strategy: strategyResponse.result,
        model: strategyResponse.model,
      },
    });

    const contentResponse = await generatePrayerContent({
      brandTone: page.brand_tone,
      lengthPreference,
      strategy: {
        ...strategyResponse.result,
        selected_style_id: selectedStyle?.id ?? null,
        selected_style_reason: selectedStyleReason,
        selected_style_confidence: selectedStyleConfidence,
      },
      selectedStyle,
      additionalInstructions,
    });

    await supabase.from("post_content").insert({
      owner_id: user.id,
      post_id: postId,
      version: 1,
      is_selected: true,
      eyebrow: contentResponse.result.eyebrow,
      title: contentResponse.result.title,
      subtitle: contentResponse.result.subtitle,
      prayer_text: contentResponse.result.prayer,
      caption: contentResponse.result.caption,
      cta: contentResponse.result.cta,
      hashtags: contentResponse.result.hashtags,
    });

    await supabase
      .from("posts")
      .update({ status: "ready_for_image", workflow_step: "content", workflow_status: "running" })
      .eq("id", postId)
      .eq("owner_id", user.id);

    await supabase
      .from("generation_runs")
      .update({
        current_step: "completed",
        status: "completed",
        completed_at: new Date().toISOString(),
      })
      .eq("id", run.id)
      .eq("owner_id", user.id);

    await logStep({
      supabase,
      userId: user.id,
      runId: run.id,
      postId,
      step: "content",
      message: "Oración y caption generados correctamente",
      payload: {
        content: {
          title: contentResponse.result.title,
          subtitle: contentResponse.result.subtitle,
          hashtags: contentResponse.result.hashtags,
        },
        model: contentResponse.model,
      },
    });

    workflowOutcome = await continueWorkflow(supabase, user.id, postId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido durante la generación.";

    await supabase
      .from("posts")
      .update({ status: "failed", workflow_step: "failed", workflow_status: "failed", workflow_error: message })
      .eq("id", postId)
      .eq("owner_id", user.id);

    await supabase
      .from("generation_runs")
      .update({
        current_step: "failed",
        status: "failed",
        error_message: message,
        completed_at: new Date().toISOString(),
      })
      .eq("id", run.id)
      .eq("owner_id", user.id);

    await logStep({
      supabase,
      userId: user.id,
      runId: run.id,
      postId,
      step: "failed",
      message,
    });

    redirect(`/generate?error=${encodeURIComponent(message)}`);
  }

  revalidatePath("/");
  revalidatePath("/generate");
  revalidatePath("/library");
  revalidatePath(`/generate/${postId}`);

  if (workflowOutcome?.state === "waiting_external_image") {
    redirect(`/generate/${postId}?workflow=waiting_image`);
  }
  if (workflowOutcome?.state === "approved") {
    redirect(`/generate/${postId}?workflow=approved`);
  }
  if (workflowOutcome?.state === "waiting_approval") {
    redirect(`/generate/${postId}?workflow=waiting_approval`);
  }
  if (workflowOutcome?.state === "failed") {
    redirect(`/generate/${postId}?error=${encodeURIComponent(workflowOutcome.error)}`);
  }

  redirect(`/generate/${postId}?generated=1`);
}
