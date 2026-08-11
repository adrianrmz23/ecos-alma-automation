import Link from "next/link";

type StyleData = {
  id?: string;
  name?: string;
  description?: string;
  category?: string;
  mood?: string;
  color_notes?: string;
  layout_notes?: string;
  usage_rules?: string;
  suggested_topics?: string[];
  suggested_figures?: string[];
  auto_select_enabled?: boolean;
  active?: boolean;
};

export function StyleForm({
  style,
  action,
  submitLabel,
}: {
  style?: StyleData;
  action: (formData: FormData) => void | Promise<void>;
  submitLabel: string;
}) {
  return (
    <form action={action} className="space-y-6">
      {style?.id ? <input type="hidden" name="style_id" value={style.id} /> : null}

      <section className="rounded-[28px] border border-slate-200 bg-white p-6 sm:p-7">
        <SectionTitle
          title="Identidad del estilo"
          description="Nombre y contexto que verá el selector automático cuando tenga que elegir una referencia."
        />
        <div className="mt-6 grid gap-5 md:grid-cols-2">
          <Field label="Nombre" hint="Ej. Claro celestial">
            <input name="name" defaultValue={style?.name ?? ""} className={inputClass} required maxLength={80} />
          </Field>
          <Field label="Categoría" hint="Ej. Jesús, Mariano, Santos, General">
            <input name="category" defaultValue={style?.category ?? "General"} className={inputClass} maxLength={60} />
          </Field>
          <Field label="Atmósfera / mood" hint="Ej. luminoso, solemne, nocturno, esperanzador">
            <input name="mood" defaultValue={style?.mood ?? ""} className={inputClass} maxLength={120} />
          </Field>
          <div className="md:col-span-2">
            <Field label="Descripción" hint="Qué hace único a este estilo.">
              <textarea name="description" defaultValue={style?.description ?? ""} rows={3} className={`${inputClass} resize-y leading-6`} />
            </Field>
          </div>
        </div>
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white p-6 sm:p-7">
        <SectionTitle
          title="Guía visual"
          description="Estas notas acompañarán a las imágenes de referencia. No son un prompt final; son memoria visual estructurada."
        />
        <div className="mt-6 grid gap-5 md:grid-cols-2">
          <Field label="Colores y luz" hint="Ej. azul cielo, dorado, blanco; iluminación celestial suave">
            <textarea name="color_notes" defaultValue={style?.color_notes ?? ""} rows={4} className={`${inputClass} resize-y leading-6`} />
          </Field>
          <Field label="Composición" hint="Ej. figura a la izquierda, oración a la derecha, marca al centro abajo">
            <textarea name="layout_notes" defaultValue={style?.layout_notes ?? ""} rows={4} className={`${inputClass} resize-y leading-6`} />
          </Field>
          <div className="md:col-span-2">
            <Field label="Reglas de uso" hint="Detalles que deben conservarse o situaciones en las que no debe usarse.">
              <textarea name="usage_rules" defaultValue={style?.usage_rules ?? ""} rows={4} className={`${inputClass} resize-y leading-6`} />
            </Field>
          </div>
        </div>
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white p-6 sm:p-7">
        <SectionTitle
          title="Selección automática"
          description="Estas señales ayudarán a que la IA elija el estilo correcto en el Bloque 3. Separa los valores con comas."
        />
        <div className="mt-6 grid gap-5 md:grid-cols-2">
          <Field label="Temas sugeridos" hint="esperanza, protección, renovación">
            <input
              name="suggested_topics"
              defaultValue={(style?.suggested_topics ?? []).join(", ")}
              className={inputClass}
            />
          </Field>
          <Field label="Figuras sugeridas" hint="Jesús, San José, Santa Rita">
            <input
              name="suggested_figures"
              defaultValue={(style?.suggested_figures ?? []).join(", ")}
              className={inputClass}
            />
          </Field>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <Toggle
            name="auto_select_enabled"
            defaultChecked={style?.auto_select_enabled ?? true}
            title="Disponible para la IA"
            description="El selector automático podrá elegir este estilo."
          />
          <Toggle
            name="active"
            defaultChecked={style?.active ?? true}
            title="Estilo activo"
            description="Aparece en la biblioteca y en la selección manual."
          />
        </div>
      </section>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Link href="/styles" className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-center text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
          Cancelar
        </Link>
        <button type="submit" className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800">
          {submitLabel}
        </button>
      </div>
    </form>
  );
}

const inputClass =
  "w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-300 focus:border-slate-400 focus:ring-4 focus:ring-slate-100";

function SectionTitle({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
      <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">{description}</p>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-slate-700">{label}</span>
      {children}
      {hint ? <span className="mt-2 block text-xs leading-5 text-slate-400">{hint}</span> : null}
    </label>
  );
}

function Toggle({
  name,
  defaultChecked,
  title,
  description,
}: {
  name: string;
  defaultChecked: boolean;
  title: string;
  description: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 p-4">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="mt-1 h-4 w-4 accent-slate-950" />
      <span>
        <span className="block text-sm font-semibold text-slate-900">{title}</span>
        <span className="mt-1 block text-xs leading-5 text-slate-500">{description}</span>
      </span>
    </label>
  );
}
