import { FacebookApiError } from "@/lib/facebook/client";

export const MAX_AUTO_RETRIES = 3;

const RATE_LIMIT_CODES = new Set(["4", "17", "32", "613"]);
const TEMPORARY_GRAPH_CODES = new Set(["2"]);
const RETRY_DELAYS_MINUTES = [2, 5, 15];

export type FailureDecision = {
  kind: "transient" | "permanent" | "connection" | "ambiguous";
  autoRetry: boolean;
  retryAt: string | null;
  userMessage: string;
};

export function getRetryAt(retryCount: number) {
  const index = Math.min(Math.max(retryCount, 0), RETRY_DELAYS_MINUTES.length - 1);
  return new Date(Date.now() + RETRY_DELAYS_MINUTES[index] * 60_000).toISOString();
}

export function classifyFacebookFailure(error: unknown, retryCount: number): FailureDecision {
  if (!(error instanceof FacebookApiError)) {
    return {
      kind: "ambiguous",
      autoRetry: false,
      retryAt: null,
      userMessage: "La comunicación se interrumpió sin una respuesta concluyente de Facebook. Revisa la Página antes de reintentar para evitar duplicados.",
    };
  }

  if (error.errorCode === "190") {
    return {
      kind: "connection",
      autoRetry: false,
      retryAt: null,
      userMessage: "Facebook rechazó el token de acceso. Intentaremos recuperar la conexión antes de volver a publicar.",
    };
  }

  const explicitlyTransient = error.httpStatus === 429 || RATE_LIMIT_CODES.has(error.errorCode) || TEMPORARY_GRAPH_CODES.has(error.errorCode);

  if (explicitlyTransient && retryCount < MAX_AUTO_RETRIES) {
    return {
      kind: "transient",
      autoRetry: true,
      retryAt: getRetryAt(retryCount),
      userMessage: "Facebook devolvió un error temporal. La app lo reintentará automáticamente sin perder la publicación.",
    };
  }

  if (explicitlyTransient) {
    return {
      kind: "permanent",
      autoRetry: false,
      retryAt: null,
      userMessage: `Se alcanzó el máximo de ${MAX_AUTO_RETRIES} reintentos automáticos. Revisa el error antes de volver a intentar.`,
    };
  }

  if (error.httpStatus >= 500) {
    return {
      kind: "ambiguous",
      autoRetry: false,
      retryAt: null,
      userMessage: "Facebook respondió con un error de servidor. Para evitar un posible duplicado, la publicación requiere revisión manual antes de reintentar.",
    };
  }

  return {
    kind: "permanent",
    autoRetry: false,
    retryAt: null,
    userMessage: "Facebook rechazó la publicación con un error que requiere revisión manual.",
  };
}
