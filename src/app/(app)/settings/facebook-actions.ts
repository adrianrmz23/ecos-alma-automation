"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  exchangeBusinessLoginCode,
  listPagesForSystemUser,
} from "@/lib/facebook/client";
import {
  disconnectFacebookConnection,
  saveConnectedFacebookPage,
  savePendingFacebookConnection,
  selectFacebookPageFromPending,
  testStoredFacebookConnection,
} from "@/lib/facebook/connection";

export type FacebookActionResult =
  | {
      ok: true;
      message: string;
      pageName?: string;
      pageId?: string;
      requiresPageSelection?: false;
    }
  | {
      ok: true;
      message: string;
      requiresPageSelection: true;
      pages: Array<{ id: string; name: string }>;
    }
  | { ok: false; error: string };

async function getContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false as const, error: "Tu sesión expiró. Vuelve a iniciar sesión." };

  const { data: page } = await supabase
    .from("pages")
    .select("id,name")
    .eq("owner_id", user.id)
    .eq("slug", "ecos-del-alma")
    .maybeSingle();

  if (!page) return { ok: false as const, error: "Primero guarda la configuración de Ecos del Alma." };

  return { ok: true as const, supabase, user, page };
}

function normalizeName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function revalidateFacebookViews() {
  revalidatePath("/");
  revalidatePath("/settings");
  revalidatePath("/queue");
}

export async function completeFacebookBusinessLoginAction(code: string): Promise<FacebookActionResult> {
  const context = await getContext();
  if (!context.ok) return context;

  if (!code.trim()) return { ok: false, error: "Meta no devolvió un código de autorización válido." };

  const { supabase, user, page } = context;

  try {
    const token = await exchangeBusinessLoginCode(code.trim());
    const pages = await listPagesForSystemUser(token.accessToken);

    if (pages.length === 0) {
      return {
        ok: false,
        error: "Meta no devolvió ninguna Página autorizada. Repite la conexión y selecciona Ecos del Alma como activo.",
      };
    }

    const desiredName = normalizeName(page.name || "Ecos del Alma");
    const exactPage = pages.find((candidate) => normalizeName(candidate.name) === desiredName);
    const selected = exactPage ?? (pages.length === 1 ? pages[0] : null);

    if (selected) {
      const result = await saveConnectedFacebookPage({
        supabase,
        ownerId: user.id,
        pageId: page.id,
        systemUserToken: token.accessToken,
        facebookPage: selected,
      });

      revalidateFacebookViews();
      return {
        ok: true,
        message: `Facebook quedó conectado con ${result.pageName}.`,
        pageName: result.pageName,
        pageId: result.pageId,
        requiresPageSelection: false,
      };
    }

    await savePendingFacebookConnection({
      supabase,
      ownerId: user.id,
      pageId: page.id,
      systemUserToken: token.accessToken,
      pages,
    });

    revalidateFacebookViews();
    return {
      ok: true,
      requiresPageSelection: true,
      message: "Meta autorizó varias Páginas. Selecciona cuál corresponde a Ecos del Alma.",
      pages: pages.map((candidate) => ({ id: candidate.id, name: candidate.name })),
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "No pudimos completar la conexión con Facebook.",
    };
  }
}

export async function selectFacebookPageAction(facebookPageId: string): Promise<FacebookActionResult> {
  const context = await getContext();
  if (!context.ok) return context;

  try {
    const result = await selectFacebookPageFromPending({
      supabase: context.supabase,
      ownerId: context.user.id,
      pageId: context.page.id,
      facebookPageId,
    });

    revalidateFacebookViews();
    return {
      ok: true,
      message: `Facebook quedó conectado con ${result.pageName}.`,
      pageName: result.pageName,
      pageId: result.pageId,
      requiresPageSelection: false,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "No pudimos seleccionar la Página de Facebook.",
    };
  }
}

export async function testFacebookConnectionAction(): Promise<FacebookActionResult> {
  const context = await getContext();
  if (!context.ok) return context;

  try {
    const result = await testStoredFacebookConnection({
      supabase: context.supabase,
      ownerId: context.user.id,
      pageId: context.page.id,
    });

    revalidateFacebookViews();
    return {
      ok: true,
      message: `Conexión correcta con ${result.pageName}.`,
      pageName: result.pageName,
      pageId: result.pageId,
      requiresPageSelection: false,
    };
  } catch (error) {
    revalidateFacebookViews();
    return {
      ok: false,
      error: error instanceof Error ? error.message : "No pudimos validar la conexión con Facebook.",
    };
  }
}

export async function disconnectFacebookAction(): Promise<FacebookActionResult> {
  const context = await getContext();
  if (!context.ok) return context;

  try {
    await disconnectFacebookConnection({
      supabase: context.supabase,
      ownerId: context.user.id,
      pageId: context.page.id,
    });

    revalidateFacebookViews();
    return { ok: true, message: "Facebook se desconectó de Ecos del Alma.", requiresPageSelection: false };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "No pudimos desconectar Facebook.",
    };
  }
}
