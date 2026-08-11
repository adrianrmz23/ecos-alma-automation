import { createClient } from "@supabase/supabase-js";

export function getSupabaseAdminRuntimeStatus() {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  const secretKey = (process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();

  return {
    configured: Boolean(url && secretKey),
    url,
    usesNewSecretKey: Boolean((process.env.SUPABASE_SECRET_KEY ?? "").trim()),
  };
}

export function createAdminClient() {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  const secretKey = (process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();

  if (!url || !secretKey) {
    throw new Error("Falta SUPABASE_SECRET_KEY (o SUPABASE_SERVICE_ROLE_KEY) para ejecutar el scheduler automático.");
  }

  return createClient(url, secretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
