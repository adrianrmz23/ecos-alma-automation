import { PageHeader } from "@/components/page-header";
import { GenerationForm } from "@/components/generation-form";
import { createClient } from "@/lib/supabase/server";

type GeneratePageProps = {
  searchParams: Promise<{ error?: string }>;
};

const errorMap: Record<string, string> = {
  styles: "No hay estilos disponibles para la selección automática. Activa al menos un estilo con referencias.",
  manual_style: "Debes seleccionar un estilo manual válido.",
  save: "No pudimos crear el borrador inicial en Supabase.",
};

export default async function GeneratePage({ searchParams }: GeneratePageProps) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: page } = await supabase
    .from("pages")
    .select("id,default_reference_mode,default_workflow_mode,default_image_source_mode")
    .eq("owner_id", user!.id)
    .eq("slug", "ecos-del-alma")
    .maybeSingle();

  const { data: stylesRaw } = page
    ? await supabase
        .from("visual_styles")
        .select("id,name,category,active")
        .eq("owner_id", user!.id)
        .eq("page_id", page.id)
        .eq("active", true)
        .order("name")
    : { data: [] };

  const styleIds = (stylesRaw ?? []).map((style) => style.id);
  const { data: refs } = styleIds.length
    ? await supabase
        .from("style_references")
        .select("style_id")
        .eq("owner_id", user!.id)
        .in("style_id", styleIds)
    : { data: [] };

  const refCounts = new Map<string, number>();
  for (const reference of refs ?? []) {
    refCounts.set(reference.style_id, (refCounts.get(reference.style_id) ?? 0) + 1);
  }

  const styles = (stylesRaw ?? [])
    .filter((style) => (refCounts.get(style.id) ?? 0) > 0)
    .map((style) => ({
      id: style.id,
      name: style.name,
      category: style.category,
      referenceCount: refCounts.get(style.id) ?? 0,
    }));

  const decodedError = params.error ? decodeURIComponent(params.error) : "";
  const errorMessage = errorMap[decodedError] ?? decodedError;

  return (
    <>
      <PageHeader
        eyebrow="Bloque 6 · Workflow"
        title="Generar publicación"
        description="Inicia el workflow completo: estrategia, texto, imagen y QA. Si eliges imagen externa, el sistema se detiene justo donde necesita tu intervención y luego continúa."
      />

      {errorMessage ? (
        <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</div>
      ) : null}

      {styles.length === 0 ? (
        <section className="rounded-[28px] border border-amber-200 bg-amber-50 p-6 sm:p-7">
          <h2 className="text-lg font-semibold text-amber-950">Faltan estilos utilizables</h2>
          <p className="mt-2 text-sm leading-6 text-amber-800">
            Necesitas al menos un estilo activo con referencias para continuar con el Bloque 3.
          </p>
        </section>
      ) : (
        <GenerationForm
          defaultReferenceMode={(page?.default_reference_mode as "automatic" | "manual") ?? "automatic"}
          defaultWorkflowMode={(page?.default_workflow_mode as "supervised" | "automatic") ?? "supervised"}
          defaultImageSourceMode={(page?.default_image_source_mode as "external" | "api") ?? "external"}
          styles={styles}
        />
      )}
    </>
  );
}
