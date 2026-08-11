type FacebookErrorPayload = {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
  [key: string]: unknown;
};

type FacebookTokenExchangeResponse = FacebookErrorPayload & {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
};

type FacebookPageResponse = FacebookErrorPayload & {
  id?: string;
  name?: string;
};

type FacebookPageListResponse = FacebookErrorPayload & {
  data?: Array<{
    id: string;
    name: string;
    access_token?: string;
    tasks?: string[];
  }>;
  paging?: {
    next?: string;
  };
};

type FacebookPhotoResponse = FacebookErrorPayload & {
  id?: string;
  post_id?: string;
};

export type FacebookBusinessPage = {
  id: string;
  name: string;
  accessToken: string;
  tasks: string[];
};

export class FacebookApiError extends Error {
  httpStatus: number;
  errorCode: string;
  errorSubcode: string;
  payload: FacebookErrorPayload;

  constructor(
    message: string,
    options: {
      httpStatus: number;
      errorCode?: string;
      errorSubcode?: string;
      payload?: FacebookErrorPayload;
    },
  ) {
    super(message);
    this.name = "FacebookApiError";
    this.httpStatus = options.httpStatus;
    this.errorCode = options.errorCode ?? "";
    this.errorSubcode = options.errorSubcode ?? "";
    this.payload = options.payload ?? {};
  }
}

export function getFacebookAppRuntimeStatus() {
  const appId = (process.env.FACEBOOK_APP_ID ?? "").trim();
  const appSecret = (process.env.FACEBOOK_APP_SECRET ?? "").trim();
  const configId = (process.env.FACEBOOK_LOGIN_CONFIG_ID ?? "").trim();
  const graphVersion = (process.env.FACEBOOK_GRAPH_VERSION ?? "v26.0").trim() || "v26.0";

  return {
    configured: Boolean(appId && appSecret && configId),
    appId,
    configId,
    graphVersion,
  };
}

function getFacebookServerConfig() {
  const runtime = getFacebookAppRuntimeStatus();
  const appSecret = (process.env.FACEBOOK_APP_SECRET ?? "").trim();

  if (!runtime.appId || !appSecret || !runtime.configId) {
    throw new Error("Faltan FACEBOOK_APP_ID, FACEBOOK_APP_SECRET o FACEBOOK_LOGIN_CONFIG_ID en .env.local.");
  }

  return {
    appId: runtime.appId,
    appSecret,
    configId: runtime.configId,
    graphVersion: runtime.graphVersion,
  };
}

async function parseResponse(response: Response) {
  const raw = await response.text();
  if (!raw) return {} as Record<string, unknown>;

  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return { raw };
  }
}

function throwIfFacebookError(response: Response, payload: FacebookErrorPayload, fallback: string): never | void {
  if (!response.ok || payload.error) {
    const message = payload.error?.message || `${fallback} Facebook respondió con HTTP ${response.status}.`;
    throw new FacebookApiError(message, {
      httpStatus: response.status,
      errorCode: payload.error?.code ? String(payload.error.code) : "",
      errorSubcode: payload.error?.error_subcode ? String(payload.error.error_subcode) : "",
      payload,
    });
  }
}

export async function exchangeBusinessLoginCode(code: string) {
  const config = getFacebookServerConfig();
  const url = new URL(`https://graph.facebook.com/${config.graphVersion}/oauth/access_token`);
  url.searchParams.set("client_id", config.appId);
  url.searchParams.set("client_secret", config.appSecret);
  url.searchParams.set("code", code);

  const response = await fetch(url, { method: "GET", cache: "no-store" });
  const payload = (await parseResponse(response)) as FacebookTokenExchangeResponse;
  throwIfFacebookError(response, payload, "No pudimos intercambiar el código de Facebook.");

  if (!payload.access_token) {
    throw new FacebookApiError("Meta no devolvió el Business Integration System User token.", {
      httpStatus: response.status,
      payload,
    });
  }

  return {
    accessToken: payload.access_token,
    tokenType: payload.token_type || "bearer",
    expiresIn: payload.expires_in ?? null,
  };
}

export async function listPagesForSystemUser(systemUserToken: string) {
  const { graphVersion } = getFacebookServerConfig();
  const pages: FacebookBusinessPage[] = [];
  let nextUrl = new URL(`https://graph.facebook.com/${graphVersion}/me/accounts`);
  nextUrl.searchParams.set("fields", "id,name,access_token,tasks");
  nextUrl.searchParams.set("limit", "100");

  while (nextUrl) {
    const response = await fetch(nextUrl, {
      method: "GET",
      headers: { Authorization: `Bearer ${systemUserToken}` },
      cache: "no-store",
    });

    const payload = (await parseResponse(response)) as FacebookPageListResponse;
    throwIfFacebookError(response, payload, "No pudimos consultar las Páginas autorizadas.");

    for (const page of payload.data ?? []) {
      if (!page.id || !page.name || !page.access_token) continue;
      pages.push({
        id: page.id,
        name: page.name,
        accessToken: page.access_token,
        tasks: Array.isArray(page.tasks) ? page.tasks : [],
      });
    }

    if (!payload.paging?.next) break;
    nextUrl = new URL(payload.paging.next);
  }

  return pages;
}

export async function testFacebookPageConnection(input: { pageId: string; accessToken: string }) {
  const { graphVersion } = getFacebookServerConfig();
  const url = new URL(`https://graph.facebook.com/${graphVersion}/${input.pageId}`);
  url.searchParams.set("fields", "id,name");

  const response = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${input.accessToken}` },
    cache: "no-store",
  });

  const payload = (await parseResponse(response)) as FacebookPageResponse;
  throwIfFacebookError(response, payload, "No pudimos validar la Página de Facebook.");

  if (!payload.id) {
    throw new FacebookApiError("Facebook respondió sin un Page ID válido.", {
      httpStatus: response.status,
      payload,
    });
  }

  if (payload.id !== input.pageId) {
    throw new FacebookApiError("El token respondió para una Página distinta a la seleccionada.", {
      httpStatus: response.status,
      payload,
    });
  }

  return {
    pageId: payload.id,
    pageName: payload.name || "Página de Facebook",
    graphVersion,
  };
}

export async function publishFacebookPhoto(input: {
  pageId: string;
  accessToken: string;
  image: Blob;
  filename: string;
  caption?: string;
}) {
  const { graphVersion } = getFacebookServerConfig();
  const form = new FormData();

  form.append("source", input.image, input.filename || "post-image.png");
  form.append("published", "true");
  if (input.caption?.trim()) {
    form.append("message", input.caption.trim());
  }

  const response = await fetch(`https://graph.facebook.com/${graphVersion}/${input.pageId}/photos`, {
    method: "POST",
    headers: { Authorization: `Bearer ${input.accessToken}` },
    body: form,
    cache: "no-store",
  });

  const payload = (await parseResponse(response)) as FacebookPhotoResponse;
  throwIfFacebookError(response, payload, "No pudimos publicar la imagen.");

  if (!payload.id && !payload.post_id) {
    throw new FacebookApiError("Facebook no devolvió un identificador para la publicación.", {
      httpStatus: response.status,
      payload,
    });
  }

  return {
    photoId: payload.id || "",
    postId: payload.post_id || payload.id || "",
    httpStatus: response.status,
    payload,
  };
}
