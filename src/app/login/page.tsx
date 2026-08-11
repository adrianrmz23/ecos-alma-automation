import { BookOpen } from "lucide-react";
import { login } from "./actions";

type LoginPageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const errorMessage =
    params.error === "missing"
      ? "Escribe tu correo y contraseña."
      : params.error === "invalid"
        ? "No pudimos iniciar sesión. Revisa tus datos."
        : null;

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#f5f2ec] px-5 py-10">
      <div className="pointer-events-none absolute -right-28 -top-28 h-96 w-96 rounded-full bg-[#dcc5a2]/25 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-36 -left-28 h-[30rem] w-[30rem] rounded-full bg-[#9eb6a6]/15 blur-3xl" />

      <div className="relative mx-auto grid min-h-[calc(100vh-5rem)] max-w-5xl items-center gap-10 lg:grid-cols-[1fr_440px]">
        <section className="hidden pr-10 lg:block">
          <div className="inline-flex items-center gap-3">
            <div className="relative flex h-12 w-12 items-center justify-center rounded-[16px] bg-[#1b241f] text-[#f3e7d3]">
              <BookOpen size={20} strokeWidth={1.8} />
              <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-[#f5f2ec] bg-[#b9874b]" />
            </div>
            <div>
              <p className="text-sm font-semibold text-[#19221d]">Ecos del Alma</p>
              <p className="mt-0.5 text-xs text-[#8b928d]">Publisher Studio</p>
            </div>
          </div>
          <h1 className="mt-10 max-w-xl text-5xl font-semibold leading-[1.02] tracking-[-0.045em] text-[#18211c]">
            Publica con calma.<br />La cola hace el resto.
          </h1>
          <p className="mt-6 max-w-lg text-base leading-7 text-[#6f7872]">
            Un espacio privado para preparar imágenes, programarlas y supervisar su publicación automática en Facebook.
          </p>
          <div className="mt-10 flex items-center gap-6 text-sm text-[#808882]">
            <span>Programación masiva</span>
            <span className="h-1 w-1 rounded-full bg-[#b68a54]" />
            <span>Cola automática</span>
            <span className="h-1 w-1 rounded-full bg-[#b68a54]" />
            <span>Historial</span>
          </div>
        </section>

        <section className="surface-card w-full p-7 sm:p-9">
          <div className="mb-8">
            <span className="inline-flex rounded-full border border-[#e6dac8] bg-[#f6efe5] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#956b36]">Acceso privado</span>
            <h2 className="mt-5 text-3xl font-semibold tracking-[-0.035em] text-[#18211c]">Bienvenido de nuevo</h2>
            <p className="mt-2 text-sm leading-6 text-[#757e78]">Ingresa para continuar con tu programación.</p>
          </div>

          {errorMessage ? (
            <div className="mb-5 rounded-[16px] border border-[#efcaca] bg-[#fff6f6] px-4 py-3 text-sm text-[#a84949]">
              {errorMessage}
            </div>
          ) : null}

          <form action={login} className="space-y-5">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-[#59625c]">Correo</span>
              <input
                type="email"
                name="email"
                autoComplete="email"
                className="focus-premium w-full rounded-[16px] border border-[#e2ddd5] bg-white px-4 py-3.5 text-sm text-[#28312b] outline-none transition placeholder:text-[#a1a8a3]"
                placeholder="tu@correo.com"
                required
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-[#59625c]">Contraseña</span>
              <input
                type="password"
                name="password"
                autoComplete="current-password"
                className="focus-premium w-full rounded-[16px] border border-[#e2ddd5] bg-white px-4 py-3.5 text-sm text-[#28312b] outline-none transition placeholder:text-[#a1a8a3]"
                placeholder="••••••••"
                required
              />
            </label>

            <button
              type="submit"
              className="mt-2 w-full rounded-[16px] bg-[#1b241f] px-4 py-3.5 text-sm font-semibold text-white shadow-[0_12px_28px_rgba(27,36,31,0.14)] transition hover:-translate-y-0.5 hover:bg-[#26312b]"
            >
              Entrar al estudio
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
