"use client";

import { useMemo, useState } from "react";
import { ImageUp, Sparkles, WandSparkles } from "lucide-react";
import { SubmitButton } from "@/components/submit-button";
import { generatePost } from "@/app/(app)/generate/actions";

type StyleOption = {
  id: string;
  name: string;
  category: string;
  referenceCount: number;
};

type GenerationFormProps = {
  defaultReferenceMode: "automatic" | "manual";
  defaultWorkflowMode: "supervised" | "automatic";
  defaultImageSourceMode: "external" | "api";
  styles: StyleOption[];
};

export function GenerationForm({
  defaultReferenceMode,
  defaultWorkflowMode,
  defaultImageSourceMode,
  styles,
}: GenerationFormProps) {
  const [referenceMode, setReferenceMode] = useState<"automatic" | "manual">(defaultReferenceMode);
  const [workflowMode, setWorkflowMode] = useState<"supervised" | "automatic">(defaultWorkflowMode);
  const [imageSourceMode, setImageSourceMode] = useState<"external" | "api">(defaultImageSourceMode);

  const usableManualStyles = useMemo(() => styles, [styles]);

  return (
    <form action={generatePost} className="space-y-6">
      <section className="rounded-[28px] border border-slate-200 bg-white p-6 sm:p-7">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-2xl bg-amber-50 p-2 text-amber-700">
            <Sparkles size={18} />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-950">Contenido</h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              El orquestador empieza por estrategia + redacción y después avanza automáticamente hasta donde permita el origen de imagen elegido.
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-5 md:grid-cols-2">
          <Field label="Tema sugerido (opcional)">
            <input name="topic_hint" placeholder="Ej. esperanza, trabajo, paz interior" className={inputClass} />
          </Field>
          <Field label="Figura religiosa (opcional)">
            <input name="figure_hint" placeholder="Ej. Jesús, Virgen María, Santa Cecilia" className={inputClass} />
          </Field>
          <Field label="Intención (opcional)">
            <input name="intention_hint" placeholder="Ej. fortaleza y esperanza" className={inputClass} />
          </Field>
          <Field label="Longitud de la oración">
            <select name="length_preference" defaultValue="medium" className={inputClass}>
              <option value="short">Breve</option>
              <option value="medium">Media</option>
              <option value="long">Amplia</option>
            </select>
          </Field>
        </div>

        <div className="mt-5">
          <Field label="Instrucciones adicionales (opcional)">
            <textarea name="additional_instructions" rows={4} placeholder="Ej. Evita mencionar enfermedad; tono más sereno; enfocarlo a oración de la noche." className={`${inputClass} resize-y leading-6`} />
          </Field>
        </div>
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white p-6 sm:p-7">
        <h2 className="text-lg font-semibold text-slate-950">Referencia visual</h2>
        <p className="mt-1 text-sm leading-6 text-slate-500">Puedes dejar que la IA elija el mejor estilo o forzar uno manualmente.</p>

        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <ChoiceCard selected={referenceMode === "automatic"} title="Automática — IA elige" description="Usará tema, figura, intención y tus referencias disponibles.">
            <input type="radio" name="style_mode" value="automatic" className="sr-only" checked={referenceMode === "automatic"} onChange={() => setReferenceMode("automatic")} />
          </ChoiceCard>
          <ChoiceCard selected={referenceMode === "manual"} title="Manual" description="Tú decides exactamente qué estilo usar en esta publicación.">
            <input type="radio" name="style_mode" value="manual" className="sr-only" checked={referenceMode === "manual"} onChange={() => setReferenceMode("manual")} />
          </ChoiceCard>
        </div>

        {referenceMode === "automatic" ? (
          <div className="mt-5 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
            La IA tendrá <strong>{styles.length}</strong> {styles.length === 1 ? "estilo disponible" : "estilos disponibles"} para elegir.
          </div>
        ) : (
          <div className="mt-5">
            <Field label="Estilo manual">
              <select name="selected_style_id" className={inputClass} defaultValue={usableManualStyles[0]?.id ?? ""} required={referenceMode === "manual"}>
                {usableManualStyles.length === 0 ? <option value="">No hay estilos disponibles</option> : usableManualStyles.map((style) => (
                  <option key={style.id} value={style.id}>{style.name} · {style.category} · {style.referenceCount} {style.referenceCount === 1 ? "ref." : "refs."}</option>
                ))}
              </select>
            </Field>
          </div>
        )}
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white p-6 sm:p-7">
        <h2 className="text-lg font-semibold text-slate-950">Origen de imagen</h2>
        <p className="mt-1 text-sm leading-6 text-slate-500">
          ChatGPT / externa queda como opción recomendada para evitar el coste del API de imagen. El workflow se pausa y se reanuda al subirla.
        </p>

        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <ChoiceCard selected={imageSourceMode === "external"} title="ChatGPT / externa" description="Generas la imagen fuera del API, la subes y el workflow continúa automáticamente con QA." icon={<ImageUp size={18} />}>
            <input type="radio" name="image_source_mode" value="external" className="sr-only" checked={imageSourceMode === "external"} onChange={() => setImageSourceMode("external")} />
          </ChoiceCard>
          <ChoiceCard selected={imageSourceMode === "api"} title="API — automático" description="El orquestador genera imagen, ejecuta QA y continúa sin intervención." icon={<WandSparkles size={18} />}>
            <input type="radio" name="image_source_mode" value="api" className="sr-only" checked={imageSourceMode === "api"} onChange={() => setImageSourceMode("api")} />
          </ChoiceCard>
        </div>
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white p-6 sm:p-7">
        <h2 className="text-lg font-semibold text-slate-950">Modo del flujo</h2>
        <p className="mt-1 text-sm leading-6 text-slate-500">
          El modo define qué ocurre después del QA. Supervisado espera tu aprobación; Automático puede autoaprobar si supera el umbral configurado.
        </p>

        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <ChoiceCard selected={workflowMode === "supervised"} title="Supervisado" description="El workflow llega hasta QA y espera tu decisión final.">
            <input type="radio" name="workflow_mode" value="supervised" className="sr-only" checked={workflowMode === "supervised"} onChange={() => setWorkflowMode("supervised")} />
          </ChoiceCard>
          <ChoiceCard selected={workflowMode === "automatic"} title="Automático" description="Si QA recomienda aprobar y supera el umbral, el post queda aprobado solo.">
            <input type="radio" name="workflow_mode" value="automatic" className="sr-only" checked={workflowMode === "automatic"} onChange={() => setWorkflowMode("automatic")} />
          </ChoiceCard>
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-4 rounded-[28px] border border-slate-200 bg-white p-6">
        <div>
          <p className="text-sm font-semibold text-slate-950">Bloque 6 · Orquestador</p>
          <p className="mt-1 text-sm text-slate-500">
            {imageSourceMode === "external" ? "Generará texto y quedará esperando tu imagen externa." : "Intentará completar texto → imagen → QA en una sola ejecución."}
          </p>
        </div>
        <SubmitButton
          idleLabel="Iniciar flujo"
          pendingLabel={imageSourceMode === "external" ? "Preparando publicación..." : "Ejecutando flujo..."}
          className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
        />
      </div>
    </form>
  );
}

const inputClass = "w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-2 block text-sm font-medium text-slate-700">{label}</span>{children}</label>;
}

function ChoiceCard({ selected, title, description, icon, children }: { selected: boolean; title: string; description: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className={`cursor-pointer rounded-3xl border px-5 py-5 transition ${selected ? "border-slate-900 bg-white shadow-sm" : "border-slate-200 bg-slate-50"}`}>
      {children}
      <div className="flex items-center gap-2">
        {icon ? <span className="text-slate-600">{icon}</span> : null}
        <div className="text-base font-semibold text-slate-950">{title}</div>
      </div>
      <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>
    </label>
  );
}
