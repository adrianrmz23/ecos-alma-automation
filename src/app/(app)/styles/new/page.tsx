import { PageHeader } from "@/components/page-header";
import { StyleForm } from "@/components/style-form";
import { createStyle } from "../actions";

type NewStylePageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function NewStylePage({ searchParams }: NewStylePageProps) {
  const params = await searchParams;

  return (
    <>
      <PageHeader
        eyebrow="Bloque 2 · Biblioteca visual"
        title="Nuevo estilo"
        description="Define la memoria visual del estilo. Después de guardarlo podrás subir una o varias imágenes de referencia."
      />

      {params.error ? (
        <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {params.error === "duplicate"
            ? "Ya existe un estilo con ese nombre para Ecos del Alma."
            : params.error === "name"
              ? "Escribe un nombre para el estilo."
              : "No pudimos crear el estilo. Revisa la migración del Bloque 2."}
        </div>
      ) : null}

      <StyleForm action={createStyle} submitLabel="Crear estilo y cargar referencias" />
    </>
  );
}
