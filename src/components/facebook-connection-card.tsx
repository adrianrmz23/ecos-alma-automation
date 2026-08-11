"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ExternalLink, LoaderCircle, PlugZap, XCircle } from "lucide-react";
import {
  completeFacebookBusinessLoginAction,
  disconnectFacebookAction,
  selectFacebookPageAction,
  testFacebookConnectionAction,
  type FacebookActionResult,
} from "@/app/(app)/settings/facebook-actions";

type FacebookConnectionCardProps = {
  appConfigured: boolean;
  appId: string;
  configId: string;
  graphVersion: string;
  connection: {
    status: "connected" | "select_page" | "reconnect_required" | "disconnected";
    pageName: string;
    facebookPageId: string;
    lastCheckedAt: string | null;
    lastError: string;
    availablePages: Array<{ id: string; name: string }>;
  };
};

type FacebookLoginResponse = {
  status?: string;
  authResponse?: {
    code?: string;
  } | null;
};

type FacebookSdk = {
  init: (options: { appId: string; cookie?: boolean; xfbml?: boolean; version: string }) => void;
  login: (
    callback: (response: FacebookLoginResponse) => void,
    options: {
      config_id: string;
      response_type: "code";
      override_default_response_type: true;
    },
  ) => void;
};

declare global {
  interface Window {
    FB?: FacebookSdk;
    fbAsyncInit?: () => void;
  }
}

let sdkPromise: Promise<FacebookSdk> | null = null;

function loadFacebookSdk(appId: string, graphVersion: string) {
  if (typeof window === "undefined") return Promise.reject(new Error("Facebook Login requiere el navegador."));
  if (window.FB) return Promise.resolve(window.FB);
  if (sdkPromise) return sdkPromise;

  sdkPromise = new Promise<FacebookSdk>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error("Facebook SDK tardó demasiado en cargar.")), 15000);

    window.fbAsyncInit = () => {
      if (!window.FB) {
        window.clearTimeout(timeout);
        reject(new Error("Facebook SDK no quedó disponible."));
        return;
      }

      window.FB.init({ appId, cookie: true, xfbml: false, version: graphVersion });
      window.clearTimeout(timeout);
      resolve(window.FB);
    };

    const existing = document.getElementById("facebook-jssdk");
    if (existing) return;

    const script = document.createElement("script");
    script.id = "facebook-jssdk";
    script.async = true;
    script.defer = true;
    script.crossOrigin = "anonymous";
    script.src = "https://connect.facebook.net/es_LA/sdk.js";
    script.onerror = () => {
      window.clearTimeout(timeout);
      sdkPromise = null;
      reject(new Error("No pudimos cargar Facebook SDK."));
    };
    document.body.appendChild(script);
  });

  return sdkPromise;
}

export function FacebookConnectionCard({
  appConfigured,
  appId,
  configId,
  graphVersion,
  connection,
}: FacebookConnectionCardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isSdkReady, setIsSdkReady] = useState(false);
  const [result, setResult] = useState<FacebookActionResult | null>(null);
  const [pageChoices, setPageChoices] = useState(connection.availablePages);

  const isConnected = connection.status === "connected";
  const needsReconnect = connection.status === "reconnect_required";
  const needsPageSelection = connection.status === "select_page" || pageChoices.length > 0;

  useEffect(() => {
    setPageChoices(connection.availablePages);
  }, [connection.availablePages]);

  useEffect(() => {
    if (!appConfigured || !appId) return;
    let active = true;
    loadFacebookSdk(appId, graphVersion)
      .then(() => {
        if (active) setIsSdkReady(true);
      })
      .catch((error) => {
        if (active) {
          setResult({ ok: false, error: error instanceof Error ? error.message : "No pudimos cargar Facebook SDK." });
        }
      });

    return () => {
      active = false;
    };
  }, [appConfigured, appId, graphVersion]);

  const status = useMemo(() => {
    if (!appConfigured) return { label: "Falta configurar Meta App", className: "bg-slate-100 text-[#737b75]" };
    if (isConnected) return { label: "Conectado", className: "bg-[#edf4ef] text-[#557460]" };
    if (needsReconnect) return { label: "Requiere reconexión", className: "bg-[#fbf3e6] text-[#a77335]" };
    if (needsPageSelection) return { label: "Selecciona una Página", className: "bg-[#eef3f5] text-[#55727e]" };
    return { label: "No conectado", className: "bg-slate-100 text-[#737b75]" };
  }, [appConfigured, isConnected, needsReconnect, needsPageSelection]);

  function connectFacebook() {
    setResult(null);
    setPageChoices([]);

    startTransition(async () => {
      try {
        const sdk = await loadFacebookSdk(appId, graphVersion);
        const loginResponse = await new Promise<FacebookLoginResponse>((resolve) => {
          sdk.login(resolve, {
            config_id: configId,
            response_type: "code",
            override_default_response_type: true,
          });
        });

        const code = loginResponse.authResponse?.code;
        if (!code) {
          setResult({ ok: false, error: "La conexión fue cancelada o Meta no devolvió un código de autorización." });
          return;
        }

        const actionResult = await completeFacebookBusinessLoginAction(code);
        setResult(actionResult);
        if (actionResult.ok && actionResult.requiresPageSelection) {
          setPageChoices(actionResult.pages);
        }
        if (actionResult.ok && !actionResult.requiresPageSelection) {
          setPageChoices([]);
          router.refresh();
        }
      } catch (error) {
        setResult({ ok: false, error: error instanceof Error ? error.message : "No pudimos iniciar Facebook Login for Business." });
      }
    });
  }

  function selectPage(pageId: string) {
    setResult(null);
    startTransition(async () => {
      const actionResult = await selectFacebookPageAction(pageId);
      setResult(actionResult);
      if (actionResult.ok) {
        setPageChoices([]);
        router.refresh();
      }
    });
  }

  function testConnection() {
    setResult(null);
    startTransition(async () => {
      const actionResult = await testFacebookConnectionAction();
      setResult(actionResult);
      router.refresh();
    });
  }

  function disconnect() {
    if (!window.confirm("¿Desconectar Facebook de Ecos del Alma? Las publicaciones seguirán guardadas en la cola.")) return;

    setResult(null);
    startTransition(async () => {
      const actionResult = await disconnectFacebookAction();
      setResult(actionResult);
      setPageChoices([]);
      router.refresh();
    });
  }

  return (
    <section className="surface-card p-6 sm:p-7">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <div className="flex items-center gap-2">
            <PlugZap size={18} className={isConnected ? "text-emerald-600" : needsReconnect ? "text-amber-600" : "text-slate-400"} />
            <p className="text-sm font-semibold text-[#19221d]">Conexión con Facebook</p>
          </div>
          <p className="mt-2 text-sm leading-6 text-[#737b75]">
            La conexión usa Facebook Login for Business con un System User token configurado sin caducidad por tiempo. Los tokens se cifran antes de guardarse y nunca se envían al navegador.
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${status.className}`}>{status.label}</span>
            <span className="rounded-full bg-[#f1efeb] px-3 py-1 text-xs font-semibold text-[#6f7771]">Graph API {graphVersion}</span>
            {connection.pageName ? (
              <span className="rounded-full bg-[#f1efeb] px-3 py-1 text-xs font-semibold text-[#6f7771]">{connection.pageName}</span>
            ) : null}
            {connection.facebookPageId ? (
              <span className="rounded-full bg-[#f1efeb] px-3 py-1 text-xs font-semibold text-[#6f7771]">Page ID {connection.facebookPageId}</span>
            ) : null}
          </div>

          {connection.lastCheckedAt ? (
            <p className="mt-3 text-xs text-slate-400">Última comprobación: {new Date(connection.lastCheckedAt).toLocaleString("es-MX", { timeZone: "America/Mexico_City" })}</p>
          ) : null}
          {connection.lastError && !isConnected ? <p className="mt-3 text-sm text-amber-700">{connection.lastError}</p> : null}
        </div>

        <div className="flex flex-wrap gap-2 lg:justify-end">
          {!isConnected || needsReconnect ? (
            <button
              type="button"
              onClick={connectFacebook}
              disabled={!appConfigured || !isSdkReady || isPending}
              className="inline-flex items-center justify-center gap-2 rounded-[16px] bg-[#1b241f] px-5 py-3 text-sm font-semibold text-white shadow-[0_10px_25px_rgba(27,36,31,0.10)] transition hover:-translate-y-0.5 hover:bg-[#26312b] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isPending ? <LoaderCircle size={16} className="animate-spin" /> : <ExternalLink size={16} />}
              {isPending ? "Conectando..." : needsReconnect ? "Reconectar Facebook" : "Conectar Facebook"}
            </button>
          ) : null}

          {isConnected ? (
            <>
              <button
                type="button"
                onClick={testConnection}
                disabled={isPending}
                className="inline-flex items-center justify-center gap-2 rounded-[16px] border border-[#e2ddd5] bg-white px-4 py-3 text-sm font-semibold text-[#5d6660] transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-40"
              >
                {isPending ? <LoaderCircle size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                Probar conexión
              </button>
              <button
                type="button"
                onClick={disconnect}
                disabled={isPending}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-[#737b75] transition hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:opacity-40"
              >
                Desconectar
              </button>
            </>
          ) : null}
        </div>
      </div>

      {pageChoices.length > 0 ? (
        <div className="mt-6 rounded-[22px] border border-[#d9e3e7] bg-[#f2f6f7] p-5">
          <p className="text-sm font-semibold text-[#19221d]">Selecciona la Página</p>
          <p className="mt-1 text-sm leading-6 text-slate-600">Meta devolvió varias Páginas. Elige únicamente la que debe recibir las publicaciones de esta app.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {pageChoices.map((page) => (
              <button
                key={page.id}
                type="button"
                onClick={() => selectPage(page.id)}
                disabled={isPending}
                className="rounded-2xl border border-[#d9e3e7] bg-white px-4 py-3 text-left transition hover:border-[#b9cbd2] hover:shadow-sm disabled:opacity-40"
              >
                <span className="block text-sm font-semibold text-[#19221d]">{page.name}</span>
                <span className="mt-1 block text-xs text-slate-400">Page ID {page.id}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {result ? (
        <div className={`mt-5 flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm ${result.ok ? "border-emerald-200 bg-[#edf4ef] text-[#557460]" : "border-[#efcaca] bg-[#fff6f6] text-[#a84949]"}`}>
          {result.ok ? <CheckCircle2 size={18} className="mt-0.5 shrink-0" /> : <XCircle size={18} className="mt-0.5 shrink-0" />}
          <div>
            <p className="font-semibold">{result.ok ? result.message : "No se pudo completar la acción"}</p>
            {!result.ok ? <p className="mt-1 text-xs opacity-80">{result.error}</p> : null}
          </div>
        </div>
      ) : null}

      {!appConfigured ? (
        <div className="mt-5 rounded-2xl bg-[#fbf5e8] px-4 py-3 text-sm text-[#87652f]">
          Faltan variables del Meta App en <code>.env.local</code>: FACEBOOK_APP_ID, FACEBOOK_APP_SECRET o FACEBOOK_LOGIN_CONFIG_ID.
        </div>
      ) : null}
    </section>
  );
}
