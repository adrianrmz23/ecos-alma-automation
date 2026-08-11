import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

const PUBLIC_SERVER_ROUTES = new Set([
  "/api/scheduler/tick",
  "/api/health",
]);

export async function proxy(request: NextRequest) {
  // Estas rutas no dependen de una sesión de navegador.
  // /api/scheduler/tick se protege internamente con SCHEDULER_SECRET.
  // /api/health solo expone un estado técnico mínimo.
  if (PUBLIC_SERVER_ROUTES.has(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
