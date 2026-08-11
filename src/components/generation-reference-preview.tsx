"use client";

import { useMemo, useState } from "react";
import { Sparkles } from "lucide-react";

type StyleOption = {
  id: string;
  name: string;
  category: string;
  referenceCount: number;
};

export function GenerationReferencePreview({ styles }: { styles: StyleOption[] }) {
  const [mode, setMode] = useState<"automatic" | "manual">("automatic");
  const [styleId, setStyleId] = useState(styles[0]?.id ?? "");
  const selected = useMemo(() => styles.find((style) => style.id === styleId), [styleId, styles]);

  return (
    <section className="rounded-[28px] border border-slate-200 bg-white p-6 sm:p-7">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-xl bg-amber-50 p-2 text-amber-700"><Sparkles size={17} /></div>
        <div>
          <h2 className="text-lg font-semibold text-slate-950">Referencia visual</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">El control ya queda preparado en el Bloque 2. La generación real se activa en los siguientes bloques.</p>
        </div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <label className={`cursor-pointer rounded-2xl border p-4 transition ${mode === "automatic" ? "border-slate-950 bg-slate-50" : "border-slate-200"}`}>
          <input type="radio" name="reference_mode_preview" value="automatic" checked={mode === "automatic"} onChange={() => setMode("automatic")} className="sr-only" />
          <span className="block text-sm font-semibold text-slate-900">Automática — IA elige</span>
          <span className="mt-1 block text-xs leading-5 text-slate-500">Usará tema, figura, mood, reglas y referencias recientes para decidir.</span>
        </label>
        <label className={`cursor-pointer rounded-2xl border p-4 transition ${mode === "manual" ? "border-slate-950 bg-slate-50" : "border-slate-200"}`}>
          <input type="radio" name="reference_mode_preview" value="manual" checked={mode === "manual"} onChange={() => setMode("manual")} className="sr-only" />
          <span className="block text-sm font-semibold text-slate-900">Manual</span>
          <span className="mt-1 block text-xs leading-5 text-slate-500">Tú decides exactamente qué estilo se utilizará para esa publicación.</span>
        </label>
      </div>

      {mode === "manual" ? (
        <div className="mt-5">
          <label className="block text-sm font-medium text-slate-700">Estilo</label>
          <select value={styleId} onChange={(event) => setStyleId(event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-100" disabled={styles.length === 0}>
            {styles.length === 0 ? <option value="">No hay estilos activos con referencias</option> : null}
            {styles.map((style) => <option key={style.id} value={style.id}>{style.name} · {style.category} · {style.referenceCount} ref.</option>)}
          </select>
          {selected ? <p className="mt-2 text-xs text-slate-400">Seleccionado: {selected.name}</p> : null}
        </div>
      ) : (
        <div className="mt-5 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {styles.length > 0 ? `La IA tendrá ${styles.length} ${styles.length === 1 ? "estilo disponible" : "estilos disponibles"} para elegir.` : "Todavía no hay estilos con referencias disponibles para la selección automática."}
        </div>
      )}
    </section>
  );
}
