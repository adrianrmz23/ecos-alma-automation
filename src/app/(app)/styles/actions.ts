"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const BUCKET = "style-references";

function parseCsv(value: FormDataEntryValue | null) {
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 30);
}

async function getSessionContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: page } = await supabase
    .from("pages")
    .select("id")
    .eq("owner_id", user.id)
    .eq("slug", "ecos-del-alma")
    .maybeSingle();

  if (!page) redirect("/settings");

  return { supabase, user, page };
}

export async function createStyle(formData: FormData) {
  const { supabase, user, page } = await getSessionContext();
  const name = String(formData.get("name") ?? "").trim();

  if (!name) redirect("/styles/new?error=name");

  const { data, error } = await supabase
    .from("visual_styles")
    .insert({
      owner_id: user.id,
      page_id: page.id,
      name,
      description: String(formData.get("description") ?? "").trim(),
      category: String(formData.get("category") ?? "General").trim() || "General",
      mood: String(formData.get("mood") ?? "").trim(),
      color_notes: String(formData.get("color_notes") ?? "").trim(),
      layout_notes: String(formData.get("layout_notes") ?? "").trim(),
      usage_rules: String(formData.get("usage_rules") ?? "").trim(),
      suggested_topics: parseCsv(formData.get("suggested_topics")),
      suggested_figures: parseCsv(formData.get("suggested_figures")),
      auto_select_enabled: formData.get("auto_select_enabled") === "on",
      active: formData.get("active") === "on",
    })
    .select("id")
    .single();

  if (error || !data) {
    redirect(`/styles/new?error=${error?.code === "23505" ? "duplicate" : "save"}`);
  }

  revalidatePath("/styles");
  redirect(`/styles/${data.id}?created=1`);
}

export async function updateStyle(formData: FormData) {
  const { supabase, user } = await getSessionContext();
  const id = String(formData.get("style_id") ?? "");
  const name = String(formData.get("name") ?? "").trim();

  if (!id || !name) redirect(`/styles/${id}?error=save`);

  const { error } = await supabase
    .from("visual_styles")
    .update({
      name,
      description: String(formData.get("description") ?? "").trim(),
      category: String(formData.get("category") ?? "General").trim() || "General",
      mood: String(formData.get("mood") ?? "").trim(),
      color_notes: String(formData.get("color_notes") ?? "").trim(),
      layout_notes: String(formData.get("layout_notes") ?? "").trim(),
      usage_rules: String(formData.get("usage_rules") ?? "").trim(),
      suggested_topics: parseCsv(formData.get("suggested_topics")),
      suggested_figures: parseCsv(formData.get("suggested_figures")),
      auto_select_enabled: formData.get("auto_select_enabled") === "on",
      active: formData.get("active") === "on",
    })
    .eq("id", id)
    .eq("owner_id", user.id);

  if (error) {
    redirect(`/styles/${id}?error=${error.code === "23505" ? "duplicate" : "save"}`);
  }

  revalidatePath("/styles");
  revalidatePath(`/styles/${id}`);
  revalidatePath("/generate");
  redirect(`/styles/${id}?saved=1`);
}

export async function deleteReference(formData: FormData) {
  const { supabase, user } = await getSessionContext();
  const referenceId = String(formData.get("reference_id") ?? "");
  const styleId = String(formData.get("style_id") ?? "");

  const { data: reference } = await supabase
    .from("style_references")
    .select("id,storage_path,is_primary,style_id")
    .eq("id", referenceId)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!reference) redirect(`/styles/${styleId}?error=reference`);

  const { error: storageError } = await supabase.storage.from(BUCKET).remove([reference.storage_path]);
  if (storageError) redirect(`/styles/${styleId}?error=storage`);

  const { error } = await supabase
    .from("style_references")
    .delete()
    .eq("id", reference.id)
    .eq("owner_id", user.id);

  if (error) redirect(`/styles/${styleId}?error=reference`);

  if (reference.is_primary) {
    const { data: nextReference } = await supabase
      .from("style_references")
      .select("id")
      .eq("style_id", reference.style_id)
      .eq("owner_id", user.id)
      .order("sort_order", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (nextReference) {
      await supabase
        .from("style_references")
        .update({ is_primary: true })
        .eq("id", nextReference.id)
        .eq("owner_id", user.id);
    }
  }

  revalidatePath("/styles");
  revalidatePath(`/styles/${styleId}`);
  redirect(`/styles/${styleId}?reference_deleted=1`);
}

export async function setPrimaryReference(formData: FormData) {
  const { supabase, user } = await getSessionContext();
  const referenceId = String(formData.get("reference_id") ?? "");
  const styleId = String(formData.get("style_id") ?? "");

  const { data: target } = await supabase
    .from("style_references")
    .select("id")
    .eq("id", referenceId)
    .eq("style_id", styleId)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!target) redirect(`/styles/${styleId}?error=reference`);

  await supabase
    .from("style_references")
    .update({ is_primary: false })
    .eq("style_id", styleId)
    .eq("owner_id", user.id);

  const { error } = await supabase
    .from("style_references")
    .update({ is_primary: true })
    .eq("id", referenceId)
    .eq("owner_id", user.id);

  if (error) redirect(`/styles/${styleId}?error=reference`);

  revalidatePath("/styles");
  revalidatePath(`/styles/${styleId}`);
  redirect(`/styles/${styleId}?primary=1`);
}

export async function deleteStyle(formData: FormData) {
  const { supabase, user } = await getSessionContext();
  const styleId = String(formData.get("style_id") ?? "");

  const { data: refs } = await supabase
    .from("style_references")
    .select("storage_path")
    .eq("style_id", styleId)
    .eq("owner_id", user.id);

  const paths = (refs ?? []).map((item) => item.storage_path);
  if (paths.length > 0) {
    const { error: storageError } = await supabase.storage.from(BUCKET).remove(paths);
    if (storageError) redirect(`/styles/${styleId}?error=storage`);
  }

  const { error } = await supabase
    .from("visual_styles")
    .delete()
    .eq("id", styleId)
    .eq("owner_id", user.id);

  if (error) redirect(`/styles/${styleId}?error=delete`);

  revalidatePath("/styles");
  revalidatePath("/generate");
  redirect("/styles?deleted=1");
}
