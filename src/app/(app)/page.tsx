import Link from "next/link";
import { AlertTriangle, ArrowUpRight, CalendarClock, CheckCircle2, Clock3, RefreshCw, Send } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { getFacebookAppRuntimeStatus } from "@/lib/facebook/client";
import { getFacebookConnectionSummary } from "@/lib/facebook/connection";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = await createClient();
  const facebookApp = getFacebookAppRuntimeStatus();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: page } = await supabase
    .from("pages")
    .select("id,name,status,timezone,publish_interval_minutes,publish_window_start,publish_window_end")
    .eq("owner_id", user!.id)
    .eq("slug", "ecos-del-alma")
    .maybeSingle();

  const facebook = page
    ? await getFacebookConnectionSummary({ supabase, ownerId: user!.id, pageId: page.id })
    : { status: "disconnected" as const, pageName: "" };
  const facebookConnected = facebook.status === "connected";
  const facebookNeedsReconnect = facebook.status === "reconnect_required";
  const timezone = page?.timezone ?? "America/Mexico_City";

  const { data: nextItem } = await supabase
    .from("publication_queue")
    .select("scheduled_for,original_filename")
    .eq("owner_id", user!.id)
    .eq("status", "scheduled")
    .gt("scheduled_for", new Date().toISOString())
    .order("scheduled_for", { ascending: true })
    .limit(1)
    .maybeSingle();

  const { data: queueItems } = await supabase
    .from("publication_queue")
    .select("id,scheduled_for,status")
    .eq("owner_id", user!.id)
    .in("status", ["scheduled", "ready_to_publish", "publishing", "retry_wait", "needs_review", "published"])
    .order("scheduled_for", { ascending: true })
    .limit(1000);

  const { data: health } = page
    ? await supabase
        .from("scheduler_health")
        .select("status,last_tick_at,last_success_at,last_published_at,consecutive_failures,last_duration_ms,last_error")
        .eq("owner_id", user!.id)
        .eq("page_id", page.id)
        .maybeSingle()
    : { data: null };

  const scheduled = (queueItems ?? []).filter((item) => item.status === "scheduled").length;
  const retrying = (queueItems ?? []).filter((item) => item.status === "retry_wait").length;
  const review = (queueItems ?? []).filter((item) => item.status === "needs_review").length;
  const published = (queueItems ?? []).filter((item) => item.status === "published").length;

  const nextDate = nextItem
    ? new Intl.DateTimeFormat("es-MX", { timeZone: timezone, weekday: "long", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(nextItem.scheduled_for))
    : "Sin pendientes";

  const scheduler = getSchedulerState(health?.status, health?.last_tick_at);
  const lastTick = health?.last_tick_at
    ? new Intl.DateTimeFormat("es-MX", { timeZone: timezone, dateStyle: "short", timeStyle: "short" }).format(new Date(health.last_tick_at))
    : "Todavía no ejecutado";

  return (
    <>
      <PageHeader
        eyebrow="Resumen operativo"
        title="Tu contenido, en orden y a tiempo."
        description="Programa imágenes en lote, supervisa la cola y deja que Ecos del Alma publique automáticamente cuando llegue cada horario."
        meta={facebookConnected ? "Facebook conectado" : "Facebook pendiente"}
      />

      {review > 0 ? (
        <div className="mb-6 flex items-start gap-3 rounded-[20px] border border-[#ead7af] bg-[#fbf5e8] px-4 py-4 text-sm text-[#86652f] shadow-sm">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold">Hay {review} publicación{review === 1 ? "" : "es"} que requiere{review === 1 ? "" : "n"} revisión</p>
            <p className="mt-1 leading-6 text-[#957647]">Revísala en Historial antes de reintentar para evitar una publicación duplicada.</p>
          </div>
        </div>
      ) : null}

      <section className="grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
        <div className="surface-card overflow-hidden p-6 sm:p-8">
          <div className="flex flex-col gap-7 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.17em] text-[#a47b48]">Próxima publicación</p>
              <h2 className="mt-3 max-w-xl text-3xl font-semibold tracking-[-0.035em] text-[#18211c] sm:text-4xl">{nextDate}</h2>
              <p className="mt-3 max-w-xl truncate text-sm text-[#7a827c]">{nextItem?.original_filename ?? "No hay publicaciones futuras en la cola."}</p>
            </div>
            <Link href="/bulk-schedule" className="inline-flex shrink-0 items-center justify-center gap-2 rounded-[16px] bg-[#1b241f] px-5 py-3 text-sm font-semibold text-white shadow-[0_10px_25px_rgba(27,36,31,0.12)] transition hover:-translate-y-0.5 hover:bg-[#26312b]">
              Programar imágenes <ArrowUpRight size={16} />
            </Link>
          </div>

          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MiniMetric label="En cola" value={scheduled} icon={CalendarClock} tone="gold" />
            <MiniMetric label="Publicadas" value={published} icon={CheckCircle2} tone="green" />
            <MiniMetric label="Reintentos" value={retrying} icon={RefreshCw} tone="violet" />
            <MiniMetric label="Revisión" value={review} icon={AlertTriangle} tone="amber" />
          </div>
        </div>

        <div className="surface-card p-6 sm:p-7">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#9ba19c]">Estado</p>
              <h2 className="mt-2 text-xl font-semibold tracking-[-0.02em] text-[#18211c]">Sistema operativo</h2>
            </div>
            <span className={`h-2.5 w-2.5 rounded-full ${scheduler.tone === "ok" ? "bg-[#5c886b]" : scheduler.tone === "warn" ? "bg-[#c89449]" : "bg-[#b75555]"}`} />
          </div>

          <div className="mt-6 space-y-4">
            <InfoRow label="Facebook" value={facebookConnected ? facebook.pageName || "Conectado" : facebookNeedsReconnect ? "Reconectar" : "Pendiente"} />
            <InfoRow label="Scheduler" value={scheduler.label} />
            <InfoRow label="Último ciclo" value={lastTick} />
            <InfoRow label="Intervalo" value={`${page?.publish_interval_minutes ?? 60} min`} />
            <InfoRow label="Ventana" value={`${(page?.publish_window_start ?? "07:00").slice(0, 5)} – ${(page?.publish_window_end ?? "23:00").slice(0, 5)}`} />
          </div>

          {health?.last_error ? <p className="mt-5 rounded-[16px] border border-[#ead7af] bg-[#fbf5e8] px-3.5 py-3 text-xs leading-5 text-[#886733]">{health.last_error}</p> : null}
        </div>
      </section>

      <section className="mt-5 grid gap-5 lg:grid-cols-3">
        <QuickCard href="/bulk-schedule" kicker="01" title="Programación masiva" description="Sube hasta 10 imágenes y deja que la app calcule el orden y horarios." />
        <QuickCard href="/queue" kicker="02" title="Gestionar cola" description="Cambia horarios, publica ahora o revisa reintentos sin perder contenido." />
        <QuickCard href="/library" kicker="03" title="Historial" description="Consulta publicaciones enviadas, canceladas y cualquier incidencia operativa." />
      </section>

      {!facebookConnected ? (
        <section className="mt-5 flex flex-col gap-4 rounded-[24px] border border-[#eadbc4] bg-[#f7f0e6] px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <Send size={18} className="mt-0.5 text-[#a9793e]" />
            <div>
              <p className="text-sm font-semibold text-[#382f24]">Facebook todavía necesita atención</p>
              <p className="mt-1 text-sm text-[#806f5b]">La cola se conserva aunque Facebook esté desconectado.</p>
            </div>
          </div>
          <Link href="/settings" className="inline-flex items-center gap-2 text-sm font-semibold text-[#8d6535]">Abrir configuración <ArrowUpRight size={15} /></Link>
        </section>
      ) : null}
    </>
  );
}

function MiniMetric({ label, value, icon: Icon, tone }: { label: string; value: number; icon: typeof Clock3; tone: "gold" | "green" | "violet" | "amber" }) {
  const tones = {
    gold: "bg-[#f6efe5] text-[#9b713e]",
    green: "bg-[#edf4ef] text-[#557460]",
    violet: "bg-[#f2eff7] text-[#756a8c]",
    amber: "bg-[#fbf3e6] text-[#b07932]",
  } as const;
  return (
    <div className="rounded-[19px] border border-[#ece8e0] bg-[#faf9f6] px-4 py-4">
      <div className={`inline-flex rounded-[11px] p-2 ${tones[tone]}`}><Icon size={15} /></div>
      <p className="mt-4 text-2xl font-semibold tracking-[-0.025em] text-[#18211c]">{value}</p>
      <p className="mt-1 text-xs font-medium text-[#8d948f]">{label}</p>
    </div>
  );
}

function QuickCard({ href, kicker, title, description }: { href: string; kicker: string; title: string; description: string }) {
  return (
    <Link href={href} className="group surface-card p-5 transition duration-200 hover:-translate-y-0.5 hover:border-[#ddd5ca]">
      <div className="flex items-center justify-between">
        <span className="editorial-serif text-lg italic text-[#b58a52]">{kicker}</span>
        <ArrowUpRight size={16} className="text-[#a7ada8] transition group-hover:text-[#7d6547]" />
      </div>
      <h3 className="mt-5 text-lg font-semibold tracking-[-0.015em] text-[#19221d]">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-[#727b75]">{description}</p>
    </Link>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return <div className="flex items-start justify-between gap-4 border-b border-[#eeeae3] pb-3 last:border-b-0 last:pb-0"><span className="text-sm text-[#7d857f]">{label}</span><span className="text-right text-sm font-semibold text-[#263029]">{value}</span></div>;
}

function getSchedulerState(status: string | undefined, lastTickAt: string | null | undefined) {
  if (!lastTickAt) return { label: "Pendiente de primer ciclo", tone: "warn" as const };
  if (Date.now() - new Date(lastTickAt).getTime() > 5 * 60_000) return { label: "Sin actividad reciente", tone: "warn" as const };
  if (status === "healthy") return { label: "Activo", tone: "ok" as const };
  if (status === "warning") return { label: "Activo con alertas", tone: "warn" as const };
  if (status === "error") return { label: "Error", tone: "error" as const };
  return { label: "Pendiente", tone: "warn" as const };
}
