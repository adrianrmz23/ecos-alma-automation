/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2, ExternalLink, ImageIcon, ShieldCheck, Sparkles, XCircle } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { SubmitButton } from "@/components/submit-button";
import { CopyPromptButton } from "@/components/copy-prompt-button";
import { ExternalImageUploader } from "@/components/external-image-uploader";
import { createClient } from "@/lib/supabase/server";
import { approvePost, generateImageForPost, rejectPost, runQaReview } from "@/app/(app)/generate/[id]/actions";

const STYLE_BUCKET = "style-references";
const GENERATED_BUCKET = "generated-post-images";

type PostDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ generated?: string; image?: string; external?: string; review?: string; workflow?: string; decision?: string; error?: string }>;
};

export default async function GeneratedPostDetailPage({ params, searchParams }: PostDetailPageProps) {
  const { id } = await params;
  const query = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: post } = await supabase
    .from("posts")
    .select("id,topic,figure_name,intention,workflow_mode,image_source_mode,workflow_step,workflow_status,workflow_error,style_mode,selected_style_id,selected_style_reason,selected_style_confidence,status,created_at")
    .eq("id", id)
    .eq("owner_id", user!.id)
    .maybeSingle();

  if (!post) notFound();

  const { data: content } = await supabase
    .from("post_content")
    .select("eyebrow,title,subtitle,prayer_text,caption,cta,hashtags")
    .eq("post_id", post.id)
    .eq("owner_id", user!.id)
    .eq("is_selected", true)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: run } = await supabase
    .from("generation_runs")
    .select("provider,model,current_step,status,error_message,started_at,completed_at")
    .eq("post_id", post.id)
    .eq("owner_id", user!.id)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: style } = post.selected_style_id
    ? await supabase
        .from("visual_styles")
        .select("id,name,category,mood")
        .eq("id", post.selected_style_id)
        .eq("owner_id", user!.id)
        .maybeSingle()
    : { data: null };

  const { data: coverReference } = style
    ? await supabase
        .from("style_references")
        .select("storage_path")
        .eq("style_id", style.id)
        .eq("owner_id", user!.id)
        .order("is_primary", { ascending: false })
        .order("sort_order", { ascending: true })
        .limit(1)
        .maybeSingle()
    : { data: null };

  const { data: selectedImage } = await supabase
    .from("post_images")
    .select("id,storage_path,version,prompt,revised_prompt,mime_type,source,original_filename")
    .eq("post_id", post.id)
    .eq("owner_id", user!.id)
    .eq("is_selected", true)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: latestReview } = selectedImage?.id
    ? await supabase
        .from("qa_reviews")
        .select("id,version,review_status,recommended_decision,final_decision,overall_score,content_score,brand_score,visual_score,summary,strengths,issues,recommendations,error_message,created_at,post_image_id")
        .eq("post_id", post.id)
        .eq("owner_id", user!.id)
        .eq("post_image_id", selectedImage.id)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null };

  const { data: signedCover } = coverReference
    ? await supabase.storage.from(STYLE_BUCKET).createSignedUrl(coverReference.storage_path, 60 * 60)
    : { data: null };

  const { data: signedGenerated } = selectedImage?.storage_path
    ? await supabase.storage.from(GENERATED_BUCKET).createSignedUrl(selectedImage.storage_path, 60 * 60)
    : { data: null };

  const { data: logs } = await supabase
    .from("generation_logs")
    .select("step,message,created_at")
    .eq("post_id", post.id)
    .eq("owner_id", user!.id)
    .order("created_at", { ascending: true });

  const errorMessage = query.error ? decodeURIComponent(query.error) : "";
  const chatGptPrompt = [
    "Quiero generar una nueva imagen para Ecos del Alma siguiendo la referencia visual que adjuntaré.",
    `Estilo visual: ${style?.name || "Referencia seleccionada"}.`,
    `Categoría / mood: ${style?.category || "—"} / ${style?.mood || "—"}.`,
    `Tema: ${post.topic}.`,
    `Figura religiosa: ${post.figure_name}.`,
    `Intención: ${post.intention}.`,
    `Eyebrow: ${content?.eyebrow || "Oración a"}.`,
    `Título: ${content?.title || post.figure_name}.`,
    `Subtítulo: ${content?.subtitle || post.intention}.`,
    `Oración completa: ${content?.prayer_text || ""}`,
    "Mantén la misma línea gráfica, jerarquía, elegancia, marco ornamental y distribución general de la referencia. No inventes otro estilo. Conserva una composición cuadrada para Facebook y la marca Ecos del Alma en la parte inferior.",
  ].join("\n\n");

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Link href="/generate" className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50">
          <ArrowLeft size={16} /> Volver a generar
        </Link>
        <Link href="/library" className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800">
          Ir a Biblioteca
        </Link>
      </div>

      <PageHeader
        eyebrow="Bloque 6 · Workflow"
        title={content?.title || "Publicación generada"}
        description="El orquestador coordina estrategia, texto, imagen, QA y aprobación. Si elegiste imagen externa, el flujo se detiene únicamente para que la subas y luego continúa."
      />

      {query.generated ? <SuccessBanner message="Publicación generada correctamente." /> : null}
      {query.image ? <SuccessBanner message="Imagen generada y guardada correctamente." /> : null}
      {query.external ? <SuccessBanner message="Imagen externa cargada correctamente. Esta versión ya puede pasar por QA." /> : null}
      {query.review ? <SuccessBanner message="Revisión QA ejecutada correctamente." /> : null}
      {query.workflow === "waiting_image" ? <InfoBanner message="Workflow pausado: genera la imagen en ChatGPT y súbela para continuar automáticamente." /> : null}
      {query.workflow === "waiting_approval" ? <InfoBanner message="Workflow en espera de aprobación. QA ya terminó y requiere tu decisión final." /> : null}
      {query.workflow === "approved" ? <SuccessBanner message="Workflow completado: el post quedó aprobado automáticamente." /> : null}
      {query.decision === "approved" ? <SuccessBanner message="Post aprobado correctamente." /> : null}
      {query.decision === "rejected" ? <ErrorBanner message="Post rechazado. Puedes regenerar imagen o ajustar el contenido antes de volver a revisarlo." /> : null}
      {errorMessage ? <ErrorBanner message={errorMessage} /> : null}

      <WorkflowPanel
        step={post.workflow_step}
        status={post.workflow_status}
        imageSourceMode={post.image_source_mode}
        workflowMode={post.workflow_mode}
        postStatus={post.status}
      />

      <section className="mb-6 rounded-[28px] border border-slate-200 bg-white p-6 sm:p-7">
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-3xl border border-slate-200 p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-slate-950">Generación de imagen</p>
                <p className="mt-1 text-sm leading-6 text-slate-500">Genera o regenera el arte visual basándote en las referencias del estilo seleccionado.</p>
              </div>
              <form action={generateImageForPost}>
                <input type="hidden" name="post_id" value={post.id} />
                <SubmitButton
                  idleLabel={selectedImage ? "Regenerar imagen" : "Generar imagen"}
                  pendingLabel={selectedImage ? "Regenerando..." : "Generando..."}
                  className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
                />
              </form>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-slate-950">Revisión QA</p>
                <p className="mt-1 text-sm leading-6 text-slate-500">Ejecuta el agente revisor para obtener una evaluación del post antes de aprobarlo.</p>
              </div>
              <form action={runQaReview}>
                <input type="hidden" name="post_id" value={post.id} />
                <SubmitButton
                  idleLabel={latestReview ? "Re-ejecutar QA" : "Ejecutar QA"}
                  pendingLabel="Revisando..."
                  className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-800 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-70"
                />
              </form>
            </div>
          </div>
        </div>
      </section>

      <section className="mb-6 rounded-[28px] border border-slate-200 bg-white p-6 sm:p-7">
        <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">Bloque 5.1 · ChatGPT / externa</p>
            <h2 className="mt-2 text-xl font-semibold text-slate-950">Usar una imagen generada fuera del API</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Copia el prompt, genera la imagen en ChatGPT con tu referencia visual y vuelve aquí para subirla. Esta ruta evita usar el generador de imagen por API.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <CopyPromptButton prompt={chatGptPrompt} />
              {signedCover?.signedUrl ? (
                <a href={signedCover.signedUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 transition hover:border-slate-300 hover:bg-slate-50">
                  <ExternalLink size={16} /> Ver referencia
                </a>
              ) : null}
            </div>
            <div className="mt-5 rounded-2xl bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
              Al subir una nueva imagen, el workflow reanuda automáticamente desde QA. Si el modo es automático y supera el umbral configurado, incluso puede aprobarse solo.
            </div>
          </div>
          <ExternalImageUploader postId={post.id} />
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
        <div className="space-y-6">
          {signedGenerated?.signedUrl ? (
            <article className="rounded-[28px] border border-slate-200 bg-white p-6 sm:p-7">
              <div className="flex items-center gap-2 text-amber-700">
                <ImageIcon size={16} />
                <p className="text-sm font-semibold">Imagen final</p>
              </div>
              <div className="mt-5 overflow-hidden rounded-[24px] border border-slate-200 bg-slate-50">
                <img src={signedGenerated.signedUrl} alt={content?.title || "Imagen generada"} className="h-auto w-full object-cover" />
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
                <span>Versión {selectedImage?.version ?? 1}</span>
                <span>Origen: {selectedImage?.source === "upload" ? "ChatGPT / externa" : "API"}</span>
                <span>{selectedImage?.mime_type || "image/png"}</span>
              </div>
            </article>
          ) : (
            <article className="rounded-[28px] border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
              <p className="text-sm font-semibold text-slate-900">Todavía no se ha generado la imagen</p>
              <p className="mt-2 text-sm leading-6 text-slate-500">Presiona el botón de arriba para generar el arte visual con base en la referencia seleccionada.</p>
            </article>
          )}

          <article className="rounded-[28px] border border-slate-200 bg-white p-6 sm:p-7">
            <div className="flex items-center gap-2 text-amber-700">
              <Sparkles size={16} />
              <p className="text-sm font-semibold">Contenido generado</p>
            </div>
            <div className="mt-5 space-y-5">
              <Block label="Eyebrow" value={content?.eyebrow || "—"} />
              <Block label="Título" value={content?.title || "—"} />
              <Block label="Subtítulo" value={content?.subtitle || "—"} />
              <Block label="Oración" value={content?.prayer_text || "—"} multiline />
              <Block label="Caption" value={content?.caption || "—"} multiline />
              <Block label="CTA" value={content?.cta || "—"} />
              <Block label="Hashtags" value={(content?.hashtags ?? []).join(" ") || "—"} multiline />
            </div>
          </article>

          <article className="rounded-[28px] border border-slate-200 bg-white p-6 sm:p-7">
            <div className="mb-4 flex items-center gap-2 text-emerald-700">
              <ShieldCheck size={16} />
              <p className="text-sm font-semibold text-slate-950">Resultado QA</p>
            </div>

            {!latestReview ? (
              <p className="text-sm leading-6 text-slate-500">Todavía no has ejecutado una revisión QA para esta publicación.</p>
            ) : latestReview.review_status === "failed" ? (
              <ErrorBanner message={latestReview.error_message || "La revisión QA falló."} compact />
            ) : (
              <div className="space-y-5">
                <div className="grid gap-3 sm:grid-cols-4">
                  <ScoreCard label="General" value={latestReview.overall_score} />
                  <ScoreCard label="Contenido" value={latestReview.content_score} />
                  <ScoreCard label="Marca" value={latestReview.brand_score} />
                  <ScoreCard label="Visual" value={latestReview.visual_score} />
                </div>

                <div className="rounded-2xl bg-slate-50 px-4 py-4 text-sm leading-6 text-slate-700">
                  <p className="font-semibold text-slate-950">Resumen</p>
                  <p className="mt-2">{latestReview.summary}</p>
                </div>

                <div className="grid gap-4 lg:grid-cols-3">
                  <ListBlock title="Fortalezas" items={latestReview.strengths ?? []} />
                  <ListBlock title="Problemas detectados" items={latestReview.issues ?? []} />
                  <ListBlock title="Recomendaciones" items={latestReview.recommendations ?? []} />
                </div>

                <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-4">
                  <Badge label={`Recomendación IA: ${latestReview.recommended_decision === "approve" ? "Aprobar" : "Revisar"}`} tone={latestReview.recommended_decision === "approve" ? "green" : "amber"} />
                  <Badge label={`Decisión final: ${formatFinalDecision(latestReview.final_decision)}`} tone={latestReview.final_decision === "approved" ? "green" : latestReview.final_decision === "rejected" ? "red" : "slate"} />
                  <span className="text-xs text-slate-400">Versión QA {latestReview.version}</span>
                </div>

                <div className="flex flex-wrap gap-3">
                  <form action={approvePost}>
                    <input type="hidden" name="post_id" value={post.id} />
                    <input type="hidden" name="review_id" value={latestReview.id} />
                    <SubmitButton
                      idleLabel="Aprobar post"
                      pendingLabel="Aprobando..."
                      className="rounded-2xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-70"
                    />
                  </form>
                  <form action={rejectPost}>
                    <input type="hidden" name="post_id" value={post.id} />
                    <input type="hidden" name="review_id" value={latestReview.id} />
                    <SubmitButton
                      idleLabel="Rechazar post"
                      pendingLabel="Rechazando..."
                      className="rounded-2xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-70"
                    />
                  </form>
                </div>
              </div>
            )}
          </article>

          <article className="rounded-[28px] border border-slate-200 bg-white p-6 sm:p-7">
            <p className="text-sm font-semibold text-slate-950">Trazabilidad de la ejecución</p>
            <div className="mt-4 space-y-3">
              {(logs ?? []).map((log, index) => (
                <div key={`${log.created_at}-${index}`} className="rounded-2xl bg-slate-50 px-4 py-3">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">{log.step}</span>
                    <span className="text-xs text-slate-400">{new Date(log.created_at).toLocaleString("es-MX")}</span>
                  </div>
                  <p className="mt-2 text-sm text-slate-700">{log.message}</p>
                </div>
              ))}
            </div>
          </article>
        </div>

        <div className="space-y-6">
          <article className="rounded-[28px] border border-slate-200 bg-white p-6 sm:p-7">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Estrategia</p>
            <div className="mt-4 space-y-4 text-sm">
              <InfoRow label="Tema" value={post.topic || "—"} />
              <InfoRow label="Figura" value={post.figure_name || "—"} />
              <InfoRow label="Intención" value={post.intention || "—"} />
              <InfoRow label="Modo de flujo" value={post.workflow_mode === "automatic" ? "Automático" : "Supervisado"} />
              <InfoRow label="Origen de imagen" value={post.image_source_mode === "external" ? "ChatGPT / externa" : "API"} />
              <InfoRow label="Workflow" value={`${post.workflow_step} · ${post.workflow_status}`} />
              <InfoRow label="Modo de estilo" value={post.style_mode === "automatic" ? "Automático" : "Manual"} />
              <InfoRow label="Estado" value={post.status} />
            </div>
          </article>

          <article className="rounded-[28px] border border-slate-200 bg-white p-6 sm:p-7">
            <p className="text-sm font-semibold text-slate-950">Estilo seleccionado</p>
            <div className="mt-4 overflow-hidden rounded-3xl border border-slate-200 bg-slate-50">
              <div className="aspect-[4/3] bg-slate-100">
                {signedCover?.signedUrl ? <img src={signedCover.signedUrl} alt={style?.name || "Estilo"} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-sm text-slate-400">Sin vista previa</div>}
              </div>
              <div className="p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">{style?.category || "—"}</span>
                  {post.style_mode === "automatic" ? <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">IA</span> : null}
                </div>
                <h2 className="mt-3 text-lg font-semibold text-slate-950">{style?.name || "Sin estilo"}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">{post.selected_style_reason || "Sin explicación registrada."}</p>
                <div className="mt-4 flex items-center justify-between text-xs text-slate-400">
                  <span>Confianza</span>
                  <span className="font-semibold text-slate-700">{post.selected_style_confidence ? `${Math.round(Number(post.selected_style_confidence) * 100)}%` : "—"}</span>
                </div>
              </div>
            </div>
          </article>

          <article className="rounded-[28px] border border-slate-200 bg-white p-6 sm:p-7">
            <p className="text-sm font-semibold text-slate-950">Ejecución IA</p>
            <div className="mt-4 space-y-3 text-sm">
              <InfoRow label="Proveedor" value={run?.provider || "—"} />
              <InfoRow label="Modelo" value={run?.model || "—"} />
              <InfoRow label="Run status" value={run?.status || "—"} />
              <InfoRow label="Paso actual" value={run?.current_step || "—"} />
            </div>
          </article>
        </div>
      </section>
    </>
  );
}

function WorkflowPanel({ step, status, imageSourceMode, workflowMode, postStatus }: { step: string; status: string; imageSourceMode: string; workflowMode: string; postStatus: string }) {
  const steps = [
    { key: "strategy", label: "Estrategia" },
    { key: "content", label: "Texto" },
    { key: imageSourceMode === "external" ? "waiting_image" : "image", label: imageSourceMode === "external" ? "Imagen externa" : "Imagen API" },
    { key: "review", label: "QA" },
    { key: "approval", label: "Aprobación" },
    { key: "completed", label: "Listo" },
  ];
  const order = ["strategy", "content", "waiting_image", "image", "review", "approval", "completed", "failed"];
  const current = order.indexOf(step);

  return (
    <section className="mb-6 rounded-[28px] border border-slate-200 bg-white p-6 sm:p-7">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Workflow</p>
          <h2 className="mt-2 text-lg font-semibold text-slate-950">{workflowMode === "automatic" ? "Automático" : "Supervisado"} · {imageSourceMode === "external" ? "Imagen externa" : "Imagen API"}</h2>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{status}</span>
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {steps.map((item) => {
          const idx = order.indexOf(item.key);
          const done = postStatus === "approved" || step === "completed" || (idx !== -1 && current > idx);
          const active = item.key === step || (step === "waiting_image" && item.key === "waiting_image");
          return (
            <div key={item.key} className={`rounded-2xl border px-4 py-3 ${done ? "border-emerald-200 bg-emerald-50" : active ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-slate-50"}`}>
              <p className={`text-xs font-semibold ${done ? "text-emerald-700" : active ? "text-amber-700" : "text-slate-400"}`}>{done ? "✓" : active ? "Ahora" : "Pendiente"}</p>
              <p className="mt-1 text-sm font-medium text-slate-900">{item.label}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function InfoBanner({ message }: { message: string }) {
  return <div className="mb-6 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-700">{message}</div>;
}

function SuccessBanner({ message }: { message: string }) {
  return <div className="mb-6 flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"><CheckCircle2 size={18} /> {message}</div>;
}

function ErrorBanner({ message, compact = false }: { message: string; compact?: boolean }) {
  return <div className={`${compact ? "" : "mb-6"} flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700`}><XCircle size={18} /> {message}</div>;
}

function Block({ label, value, multiline = false }: { label: string; value: string; multiline?: boolean }) {
  return (
    <div>
      <p className="mb-2 text-sm font-medium text-slate-700">{label}</p>
      <div className={`rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 ${multiline ? "whitespace-pre-line leading-7" : ""}`}>{value}</div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-3 last:border-b-0 last:pb-0">
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-medium text-slate-900">{value}</span>
    </div>
  );
}

function ScoreCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-slate-50 px-4 py-4">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function ListBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-2xl bg-slate-50 px-4 py-4">
      <p className="text-sm font-semibold text-slate-950">{title}</p>
      <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
        {items.length === 0 ? <li>—</li> : items.map((item, index) => <li key={`${title}-${index}`}>• {item}</li>)}
      </ul>
    </div>
  );
}

function Badge({ label, tone }: { label: string; tone: "green" | "amber" | "red" | "slate" }) {
  const styles = {
    green: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
    red: "bg-red-50 text-red-700",
    slate: "bg-slate-100 text-slate-700",
  } as const;

  return <span className={`rounded-full px-3 py-1 text-xs font-semibold ${styles[tone]}`}>{label}</span>;
}

function formatFinalDecision(value: string) {
  if (value === "approved") return "Aprobado";
  if (value === "rejected") return "Rechazado";
  return "Pendiente";
}
