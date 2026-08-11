import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { FacebookConnectionCard } from "@/components/facebook-connection-card";
import { getFacebookAppRuntimeStatus } from "@/lib/facebook/client";
import { getFacebookConnectionSummary } from "@/lib/facebook/connection";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdminRuntimeStatus } from "@/lib/supabase/admin";

type SettingsPageProps = {
  searchParams: Promise<{ saved?: string; error?: string }>;
};

async function saveSettings(formData: FormData) {
  "use server";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const interval = Math.max(15, Math.min(1440, Number(formData.get("publish_interval_minutes") ?? 60)));
  const payload = {
    owner_id: user.id,
    name: String(formData.get("name") ?? "Ecos del Alma").trim() || "Ecos del Alma",
    slug: "ecos-del-alma",
    platform: "facebook",
    status: String(formData.get("status") ?? "active"),
    timezone: String(formData.get("timezone") ?? "America/Mexico_City"),
    publish_interval_minutes: interval,
    publish_window_start: String(formData.get("publish_window_start") ?? "07:00"),
    publish_window_end: String(formData.get("publish_window_end") ?? "23:00"),
    brand_tone: String(formData.get("brand_tone") ?? "").trim(),
  };

  const { error } = await supabase.from("pages").upsert(payload, { onConflict: "owner_id,slug" });
  if (error) redirect("/settings?error=save");

  revalidatePath("/");
  revalidatePath("/settings");
  revalidatePath("/bulk-schedule");
  revalidatePath("/queue");
  redirect("/settings?saved=1");
}

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const facebookApp = getFacebookAppRuntimeStatus();
  const adminRuntime = getSupabaseAdminRuntimeStatus();
  const schedulerSecretConfigured = Boolean((process.env.SCHEDULER_SECRET ?? "").trim());

  const { data: page } = await supabase
    .from("pages")
    .select("id,name,status,timezone,publish_interval_minutes,publish_window_start,publish_window_end,brand_tone")
    .eq("owner_id", user!.id)
    .eq("slug", "ecos-del-alma")
    .maybeSingle();

  const facebookConnection = page
    ? await getFacebookConnectionSummary({
        supabase,
        ownerId: user!.id,
        pageId: page.id,
      })
    : {
        exists: false,
        status: "disconnected" as const,
        pageName: "",
        facebookPageId: "",
        lastCheckedAt: null,
        lastError: "",
        availablePages: [],
      };

  const { data: schedulerHealth } = page
    ? await supabase
        .from("scheduler_health")
        .select("status,last_tick_at,last_error")
        .eq("owner_id", user!.id)
        .eq("page_id", page.id)
        .maybeSingle()
    : { data: null };

  return (
    <>
      <PageHeader
        eyebrow="Configuración"
        title="Ajustes de publicación"
        description="Define horarios, comportamiento de la cola y la conexión con Facebook desde un solo lugar."
      />

      {params.saved ? <div className="mb-6 rounded-[18px] border border-[#d8e7dc] bg-[#f0f6f2] px-4 py-3 text-sm text-[#52725e]">Configuración guardada correctamente.</div> : null}
      {params.error ? <div className="mb-6 rounded-[18px] border border-[#efcaca] bg-[#fff6f6] px-4 py-3 text-sm text-[#a84949]">No pudimos guardar la configuración.</div> : null}

      <form action={saveSettings} className="space-y-6">
        <section className="surface-card p-6 sm:p-7">
          <SectionTitle title="Página" description="Identidad y zona horaria de la cuenta que vamos a programar." />
          <div className="mt-6 grid gap-5 md:grid-cols-2">
            <Field label="Nombre"><input name="name" defaultValue={page?.name ?? "Ecos del Alma"} className={inputClass} required /></Field>
            <Field label="Estado">
              <select name="status" defaultValue={page?.status ?? "active"} className={inputClass}>
                <option value="active">Activa</option>
                <option value="paused">Pausada</option>
              </select>
            </Field>
            <Field label="Zona horaria"><input name="timezone" defaultValue={page?.timezone ?? "America/Mexico_City"} className={inputClass} /></Field>
            <Field label="Plataforma"><input value="Facebook" className={`${inputClass} bg-[#faf9f6] text-[#7b837d]`} disabled /></Field>
          </div>
        </section>

        <section className="surface-card p-6 sm:p-7">
          <SectionTitle title="Programación" description="Estas reglas se aplican automáticamente a cada lote de imágenes." />
          <div className="mt-6 grid gap-5 md:grid-cols-3">
            <Field label="Intervalo entre publicaciones">
              <div className="relative"><input type="number" min={15} max={1440} name="publish_interval_minutes" defaultValue={page?.publish_interval_minutes ?? 60} className={`${inputClass} pr-14`} /><span className="pointer-events-none absolute right-4 top-3.5 text-xs font-medium text-slate-400">min</span></div>
            </Field>
            <Field label="Publicar desde"><input type="time" name="publish_window_start" defaultValue={(page?.publish_window_start ?? "07:00").slice(0, 5)} className={inputClass} /></Field>
            <Field label="Publicar hasta"><input type="time" name="publish_window_end" defaultValue={(page?.publish_window_end ?? "23:00").slice(0, 5)} className={inputClass} /></Field>
          </div>
          <div className="mt-5 rounded-[18px] border border-[#ece7df] bg-[#faf9f6] px-4 py-3 text-sm leading-6 text-[#727b75]">
            Si el último horario disponible rebasa la ventana permitida, la siguiente imagen pasa automáticamente al inicio del día siguiente.
          </div>
        </section>

        <section className="surface-card p-6 sm:p-7">
          <SectionTitle title="Texto opcional" description="Por defecto las publicaciones de programación masiva se guardan sin caption. Este campo solo queda como referencia editorial para usos futuros." />
          <textarea
            name="brand_tone"
            rows={4}
            defaultValue={page?.brand_tone ?? "Devocional, cálido, esperanzador, elegante y cercano."}
            className={`${inputClass} mt-5 resize-y leading-6`}
          />
        </section>


        <section className="surface-card p-6 sm:p-7">
          <SectionTitle title="Scheduler automático" description="La ruta del scheduler ya está protegida y preparada para ser llamada cada minuto cuando despleguemos la app." />
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <RuntimeRow label="Clave privada Supabase" value={adminRuntime.configured ? "Configurada" : "Pendiente"} ok={adminRuntime.configured} />
            <RuntimeRow label="SCHEDULER_SECRET" value={schedulerSecretConfigured ? "Configurado" : "Pendiente"} ok={schedulerSecretConfigured} />
            <RuntimeRow label="Endpoint" value="/api/scheduler/tick" ok />
            <RuntimeRow label="Estado último ciclo" value={schedulerHealth?.status ?? "pending"} ok={schedulerHealth?.status === "healthy"} />
          </div>
          <div className="mt-5 rounded-[18px] border border-[#ece7df] bg-[#faf9f6] px-4 py-3 text-sm leading-6 text-[#727b75]">
            En localhost puedes usar <strong className="text-slate-700">Ejecutar ciclo ahora</strong> desde Cola. La ejecución automática continua se activará al desplegar y conectar un Cron externo/Supabase Cron.
          </div>
          {schedulerHealth?.last_error ? <p className="mt-3 text-xs leading-5 text-amber-700">Última alerta: {schedulerHealth.last_error}</p> : null}
        </section>

        <FacebookConnectionCard
          appConfigured={facebookApp.configured}
          appId={facebookApp.appId}
          configId={facebookApp.configId}
          graphVersion={facebookApp.graphVersion}
          connection={facebookConnection}
        />

        <div className="flex justify-end">
          <button type="submit" className="rounded-[16px] bg-[#1b241f] px-5 py-3 text-sm font-semibold text-white shadow-[0_10px_25px_rgba(27,36,31,0.10)] transition hover:-translate-y-0.5 hover:bg-[#26312b]">Guardar configuración</button>
        </div>
      </form>
    </>
  );
}

const inputClass = "focus-premium w-full rounded-[16px] border border-[#e3ded6] bg-white px-4 py-3 text-sm text-[#27312b] outline-none transition placeholder:text-[#a4aaa5]";

function SectionTitle({ title, description }: { title: string; description: string }) {
  return <div><h2 className="text-lg font-semibold tracking-[-0.015em] text-[#19221d]">{title}</h2><p className="mt-1 text-sm leading-6 text-[#737b75]">{description}</p></div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-2 block text-sm font-medium text-[#59625c]">{label}</span>{children}</label>;
}

function RuntimeRow({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-[18px] border border-[#ece7df] bg-[#faf9f6] px-4 py-3">
      <span className="text-sm text-slate-500">{label}</span>
      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${ok ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{value}</span>
    </div>
  );
}
