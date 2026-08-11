/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { ImageIcon, Plus, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { createClient } from "@/lib/supabase/server";

const BUCKET = "style-references";

type StylesPageProps = {
  searchParams: Promise<{ deleted?: string }>;
};

export default async function StylesPage({ searchParams }: StylesPageProps) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: page } = await supabase
    .from("pages")
    .select("id")
    .eq("owner_id", user!.id)
    .eq("slug", "ecos-del-alma")
    .maybeSingle();

  const { data: styles } = page
    ? await supabase
        .from("visual_styles")
        .select("id,name,description,category,mood,auto_select_enabled,active,created_at")
        .eq("owner_id", user!.id)
        .eq("page_id", page.id)
        .order("created_at", { ascending: false })
    : { data: [] };

  const styleIds = (styles ?? []).map((style) => style.id);
  const { data: refs } = styleIds.length
    ? await supabase
        .from("style_references")
        .select("id,style_id,storage_path,is_primary,sort_order")
        .eq("owner_id", user!.id)
        .in("style_id", styleIds)
        .order("is_primary", { ascending: false })
        .order("sort_order", { ascending: true })
    : { data: [] };

  type ReferenceRow = NonNullable<typeof refs>[number];
  const refsByStyle = new Map<string, ReferenceRow[]>();
  for (const reference of refs ?? []) {
    const current = refsByStyle.get(reference.style_id) ?? [];
    current.push(reference);
    refsByStyle.set(reference.style_id, current);
  }

  const cards = await Promise.all(
    (styles ?? []).map(async (style) => {
      const styleRefs = refsByStyle.get(style.id) ?? [];
      const cover = styleRefs[0];
      const { data: signed } = cover
        ? await supabase.storage.from(BUCKET).createSignedUrl(cover.storage_path, 60 * 60)
        : { data: null };

      return {
        ...style,
        referenceCount: styleRefs.length,
        coverUrl: signed?.signedUrl ?? null,
      };
    }),
  );

  const autoCount = cards.filter((style) => style.active && style.auto_select_enabled && style.referenceCount > 0).length;

  return (
    <>
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
        <PageHeader
          eyebrow="Bloque 2 · Biblioteca visual"
          title="Estilos visuales"
          description="Guarda las referencias que ya definen el aspecto de Ecos del Alma. Podrás elegirlas manualmente o dejar que la IA seleccione la más adecuada."
        />
        <Link href="/styles/new" className="inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800">
          <Plus size={17} /> Nuevo estilo
        </Link>
      </div>

      {params.deleted ? (
        <div className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">Estilo eliminado correctamente.</div>
      ) : null}

      <section className="mb-7 grid gap-4 sm:grid-cols-3">
        <Summary label="Estilos" value={String(cards.length)} />
        <Summary label="Disponibles para IA" value={String(autoCount)} icon />
        <Summary label="Referencias" value={String(cards.reduce((total, style) => total + style.referenceCount, 0))} />
      </section>

      {cards.length === 0 ? (
        <section className="rounded-[28px] border border-slate-200 bg-white p-8 text-center sm:p-12">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500"><ImageIcon size={22} /></div>
          <h2 className="mt-5 text-lg font-semibold text-slate-950">Crea tu primer estilo visual</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">
            Empieza con tus referencias actuales: por ejemplo, un estilo claro celestial y otro nocturno dorado. No necesitamos reinventar el diseño; aquí documentamos lo que ya funciona.
          </p>
          <Link href="/styles/new" className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white">
            <Plus size={16} /> Crear primer estilo
          </Link>
        </section>
      ) : (
        <section className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {cards.map((style) => (
            <Link key={style.id} href={`/styles/${style.id}`} className="group overflow-hidden rounded-[28px] border border-slate-200 bg-white transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-lg hover:shadow-slate-200/50">
              <div className="aspect-[4/3] bg-slate-100">
                {style.coverUrl ? (
                  <img src={style.coverUrl} alt={style.name} className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.01]" />
                ) : (
                  <div className="flex h-full items-center justify-center text-slate-300"><ImageIcon size={30} /></div>
                )}
              </div>
              <div className="p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">{style.category}</span>
                  {style.auto_select_enabled && style.active ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700"><Sparkles size={11} /> IA</span>
                  ) : null}
                  {!style.active ? <span className="rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-600">Inactivo</span> : null}
                </div>
                <h2 className="mt-4 text-lg font-semibold text-slate-950">{style.name}</h2>
                <p className="mt-2 line-clamp-2 min-h-10 text-sm leading-5 text-slate-500">{style.description || style.mood || "Sin descripción todavía."}</p>
                <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4 text-xs text-slate-400">
                  <span>{style.referenceCount} {style.referenceCount === 1 ? "referencia" : "referencias"}</span>
                  <span className="font-semibold text-slate-600">Editar →</span>
                </div>
              </div>
            </Link>
          ))}
        </section>
      )}
    </>
  );
}

function Summary({ label, value, icon = false }: { label: string; value: string; icon?: boolean }) {
  return (
    <div className="rounded-[22px] border border-slate-200 bg-white px-5 py-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500">{label}</p>
        {icon ? <Sparkles size={15} className="text-amber-600" /> : null}
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">{value}</p>
    </div>
  );
}
