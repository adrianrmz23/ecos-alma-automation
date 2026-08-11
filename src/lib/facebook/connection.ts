import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptSecret, encryptSecret } from "@/lib/facebook/crypto";
import {
  FacebookApiError,
  listPagesForSystemUser,
  testFacebookPageConnection,
  type FacebookBusinessPage,
} from "@/lib/facebook/client";

export type FacebookConnectionStatus = "connected" | "select_page" | "reconnect_required" | "disconnected";

export type FacebookConnectionSummary = {
  exists: boolean;
  status: FacebookConnectionStatus;
  pageName: string;
  facebookPageId: string;
  lastCheckedAt: string | null;
  lastError: string;
  availablePages: Array<{ id: string; name: string }>;
};

export class FacebookConnectionError extends Error {
  code: "NOT_CONNECTED" | "RECONNECT_REQUIRED" | "MISSING_TOKEN";

  constructor(message: string, code: FacebookConnectionError["code"]) {
    super(message);
    this.name = "FacebookConnectionError";
    this.code = code;
  }
}

export async function getFacebookConnectionSummary(input: {
  supabase: SupabaseClient;
  ownerId: string;
  pageId: string;
}): Promise<FacebookConnectionSummary> {
  const { data } = await input.supabase
    .from("facebook_connections")
    .select("status,facebook_page_id,facebook_page_name,last_checked_at,last_error,available_pages")
    .eq("owner_id", input.ownerId)
    .eq("page_id", input.pageId)
    .maybeSingle();

  if (!data) {
    return {
      exists: false,
      status: "disconnected",
      pageName: "",
      facebookPageId: "",
      lastCheckedAt: null,
      lastError: "",
      availablePages: [],
    };
  }

  const availablePages = Array.isArray(data.available_pages)
    ? data.available_pages
        .filter((page: unknown): page is { id: string; name: string } => {
          if (!page || typeof page !== "object") return false;
          const candidate = page as Record<string, unknown>;
          return typeof candidate.id === "string" && typeof candidate.name === "string";
        })
        .map((page: { id: string; name: string }) => ({ id: page.id, name: page.name }))
    : [];

  return {
    exists: true,
    status: data.status as FacebookConnectionStatus,
    pageName: data.facebook_page_name || "",
    facebookPageId: data.facebook_page_id || "",
    lastCheckedAt: data.last_checked_at || null,
    lastError: data.last_error || "",
    availablePages,
  };
}

export async function savePendingFacebookConnection(input: {
  supabase: SupabaseClient;
  ownerId: string;
  pageId: string;
  systemUserToken: string;
  pages: FacebookBusinessPage[];
}) {
  const safePages = input.pages.map((page) => ({ id: page.id, name: page.name }));
  const { error } = await input.supabase.from("facebook_connections").upsert(
    {
      owner_id: input.ownerId,
      page_id: input.pageId,
      status: "select_page",
      facebook_page_id: "",
      facebook_page_name: "",
      encrypted_system_user_token: encryptSecret(input.systemUserToken),
      encrypted_page_access_token: "",
      available_pages: safePages,
      last_error: "Selecciona qué Página de Facebook se conectará con Ecos del Alma.",
      last_checked_at: new Date().toISOString(),
      connected_at: null,
    },
    { onConflict: "owner_id,page_id" },
  );

  if (error) throw new Error(`No pudimos guardar la conexión pendiente: ${error.message}`);
}

export async function saveConnectedFacebookPage(input: {
  supabase: SupabaseClient;
  ownerId: string;
  pageId: string;
  systemUserToken: string;
  facebookPage: FacebookBusinessPage;
}) {
  const validation = await testFacebookPageConnection({
    pageId: input.facebookPage.id,
    accessToken: input.facebookPage.accessToken,
  });

  const { error } = await input.supabase.from("facebook_connections").upsert(
    {
      owner_id: input.ownerId,
      page_id: input.pageId,
      status: "connected",
      facebook_page_id: validation.pageId,
      facebook_page_name: validation.pageName,
      encrypted_system_user_token: encryptSecret(input.systemUserToken),
      encrypted_page_access_token: encryptSecret(input.facebookPage.accessToken),
      available_pages: [],
      last_error: "",
      last_checked_at: new Date().toISOString(),
      connected_at: new Date().toISOString(),
    },
    { onConflict: "owner_id,page_id" },
  );

  if (error) throw new Error(`No pudimos guardar la conexión con Facebook: ${error.message}`);

  return validation;
}

export async function selectFacebookPageFromPending(input: {
  supabase: SupabaseClient;
  ownerId: string;
  pageId: string;
  facebookPageId: string;
}) {
  const { data: connection } = await input.supabase
    .from("facebook_connections")
    .select("encrypted_system_user_token")
    .eq("owner_id", input.ownerId)
    .eq("page_id", input.pageId)
    .maybeSingle();

  if (!connection?.encrypted_system_user_token) {
    throw new FacebookConnectionError("La conexión pendiente ya no contiene un token válido. Vuelve a conectar Facebook.", "MISSING_TOKEN");
  }

  const systemUserToken = decryptSecret(connection.encrypted_system_user_token);
  const pages = await listPagesForSystemUser(systemUserToken);
  const selected = pages.find((page) => page.id === input.facebookPageId);

  if (!selected) {
    throw new Error("La Página seleccionada ya no está disponible para esta conexión.");
  }

  return saveConnectedFacebookPage({
    supabase: input.supabase,
    ownerId: input.ownerId,
    pageId: input.pageId,
    systemUserToken,
    facebookPage: selected,
  });
}

export async function getFacebookPublishingCredentials(input: {
  supabase: SupabaseClient;
  ownerId: string;
  pageId: string;
}) {
  const { data: connection } = await input.supabase
    .from("facebook_connections")
    .select("status,facebook_page_id,facebook_page_name,encrypted_page_access_token")
    .eq("owner_id", input.ownerId)
    .eq("page_id", input.pageId)
    .maybeSingle();

  if (!connection || connection.status === "disconnected" || connection.status === "select_page") {
    throw new FacebookConnectionError("Facebook no está conectado. Ve a Configuración → Facebook.", "NOT_CONNECTED");
  }

  if (connection.status === "reconnect_required") {
    throw new FacebookConnectionError("Facebook requiere reconexión antes de continuar publicando.", "RECONNECT_REQUIRED");
  }

  if (!connection.facebook_page_id || !connection.encrypted_page_access_token) {
    throw new FacebookConnectionError("La conexión de Facebook está incompleta. Vuelve a conectarla.", "MISSING_TOKEN");
  }

  return {
    pageId: connection.facebook_page_id,
    pageName: connection.facebook_page_name,
    accessToken: decryptSecret(connection.encrypted_page_access_token),
  };
}

export async function refreshFacebookPageToken(input: {
  supabase: SupabaseClient;
  ownerId: string;
  pageId: string;
}) {
  const { data: connection } = await input.supabase
    .from("facebook_connections")
    .select("facebook_page_id,encrypted_system_user_token")
    .eq("owner_id", input.ownerId)
    .eq("page_id", input.pageId)
    .maybeSingle();

  if (!connection?.encrypted_system_user_token || !connection.facebook_page_id) {
    throw new FacebookConnectionError("No hay un System User token disponible para renovar la conexión.", "MISSING_TOKEN");
  }

  const systemUserToken = decryptSecret(connection.encrypted_system_user_token);
  const pages = await listPagesForSystemUser(systemUserToken);
  const page = pages.find((candidate) => candidate.id === connection.facebook_page_id);

  if (!page) {
    throw new FacebookConnectionError("La Página ya no está disponible para el System User. Reconecta Facebook.", "RECONNECT_REQUIRED");
  }

  const validation = await testFacebookPageConnection({ pageId: page.id, accessToken: page.accessToken });
  const { error } = await input.supabase
    .from("facebook_connections")
    .update({
      status: "connected",
      facebook_page_name: validation.pageName,
      encrypted_page_access_token: encryptSecret(page.accessToken),
      last_checked_at: new Date().toISOString(),
      last_error: "",
    })
    .eq("owner_id", input.ownerId)
    .eq("page_id", input.pageId);

  if (error) throw new Error(`No pudimos actualizar el token de Página: ${error.message}`);

  return {
    pageId: page.id,
    pageName: validation.pageName,
    accessToken: page.accessToken,
  };
}

export async function testStoredFacebookConnection(input: {
  supabase: SupabaseClient;
  ownerId: string;
  pageId: string;
}) {
  try {
    const credentials = await getFacebookPublishingCredentials(input);
    const result = await testFacebookPageConnection(credentials);

    await input.supabase
      .from("facebook_connections")
      .update({ last_checked_at: new Date().toISOString(), last_error: "", status: "connected" })
      .eq("owner_id", input.ownerId)
      .eq("page_id", input.pageId);

    return result;
  } catch (error) {
    if (error instanceof FacebookApiError && error.errorCode === "190") {
      try {
        const refreshed = await refreshFacebookPageToken(input);
        return {
          pageId: refreshed.pageId,
          pageName: refreshed.pageName,
          graphVersion: process.env.FACEBOOK_GRAPH_VERSION || "v26.0",
        };
      } catch (refreshError) {
        const message = refreshError instanceof Error ? refreshError.message : "Facebook requiere reconexión.";
        await markFacebookReconnectRequired({ ...input, error: message });
        throw refreshError;
      }
    }

    if (error instanceof FacebookConnectionError) throw error;

    const message = error instanceof Error ? error.message : "No pudimos validar la conexión con Facebook.";
    await input.supabase
      .from("facebook_connections")
      .update({ last_checked_at: new Date().toISOString(), last_error: message })
      .eq("owner_id", input.ownerId)
      .eq("page_id", input.pageId);
    throw error;
  }
}

export async function markFacebookReconnectRequired(input: {
  supabase: SupabaseClient;
  ownerId: string;
  pageId: string;
  error: string;
}) {
  await input.supabase
    .from("facebook_connections")
    .update({
      status: "reconnect_required",
      last_error: input.error,
      last_checked_at: new Date().toISOString(),
    })
    .eq("owner_id", input.ownerId)
    .eq("page_id", input.pageId);
}

export async function disconnectFacebookConnection(input: {
  supabase: SupabaseClient;
  ownerId: string;
  pageId: string;
}) {
  const { error } = await input.supabase
    .from("facebook_connections")
    .update({
      status: "disconnected",
      facebook_page_id: "",
      facebook_page_name: "",
      encrypted_system_user_token: "",
      encrypted_page_access_token: "",
      available_pages: [],
      last_error: "",
      last_checked_at: new Date().toISOString(),
    })
    .eq("owner_id", input.ownerId)
    .eq("page_id", input.pageId);

  if (error) throw new Error(`No pudimos desconectar Facebook: ${error.message}`);
}
