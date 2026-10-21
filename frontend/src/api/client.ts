/**
 * Cliente HTTP de la API.
 *
 * Decisiones de seguridad:
 *  - El token de acceso se guarda solo en memoria (nunca en localStorage/sessionStorage), de
 *    modo que un XSS no puede exfiltrarlo de forma persistente.
 *  - La sesión se renueva con el refresh token, que viaja en una cookie HttpOnly inaccesible
 *    desde JavaScript. Las renovaciones se serializan (en la pestaña y entre pestañas con la
 *    Web Locks API) para no disparar la detección de reutilización de tokens.
 *  - Todas las peticiones son de mismo origen (credentials: 'same-origin').
 */
import type { AuthResponse } from './types';

let accessToken: string | null = null;
let refreshInFlight: Promise<AuthResponse | null> | null = null;
let onSessionExpired: (() => void) | null = null;

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: Array<{ field?: string; message: string }>,
    public readonly requestId?: string,
  ) {
    super(message);
  }
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function setSessionExpiredHandler(handler: (() => void) | null): void {
  onSessionExpired = handler;
}

async function parseError(response: Response): Promise<ApiError> {
  try {
    const body = (await response.json()) as { error?: { code: string; message: string; details?: Array<{ field?: string; message: string }>; requestId?: string } };
    if (body.error) return new ApiError(response.status, body.error.code, body.error.message, body.error.details, body.error.requestId);
  } catch {
    // Respuesta no JSON: se usa un mensaje genérico.
  }
  return new ApiError(response.status, 'HTTP_ERROR', 'No se pudo completar la operación.');
}

/** Renueva el token de acceso usando la cookie de refresco. Devuelve null si no hay sesión. */
export function refreshSession(): Promise<AuthResponse | null> {
  if (refreshInFlight) return refreshInFlight;
  const run = async (): Promise<AuthResponse | null> => {
    const response = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'same-origin' });
    if (!response.ok) {
      accessToken = null;
      return null;
    }
    const data = (await response.json()) as AuthResponse;
    accessToken = data.accessToken;
    return data;
  };
  const locked = (async (): Promise<AuthResponse | null> =>
    typeof navigator !== 'undefined' && 'locks' in navigator ? await navigator.locks.request('gastoseguro-refresh', run) : run())();
  const inFlight = locked.finally(() => {
    refreshInFlight = null;
  });
  refreshInFlight = inFlight;
  return inFlight;
}

type Query = Record<string, string | number | undefined | null>;

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Query;
  formData?: FormData;
  /** Devuelve la respuesta sin interpretar (para descargas). */
  raw?: boolean;
}

function buildUrl(path: string, query?: Query): string {
  const url = new URL(`/api${path}`, window.location.origin);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  }
  return url.pathname + url.search;
}

async function send(path: string, options: RequestOptions): Promise<Response> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  let body: BodyInit | undefined;
  if (options.formData) body = options.formData;
  else if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.body);
  }
  return fetch(buildUrl(path, options.query), { method: options.method ?? 'GET', headers, body, credentials: 'same-origin' });
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  let response = await send(path, options);
  if (response.status === 401 && !path.startsWith('/auth/')) {
    const refreshed = await refreshSession();
    if (refreshed) response = await send(path, options);
    if (!refreshed || response.status === 401) {
      onSessionExpired?.();
      throw await parseError(response);
    }
  }
  if (!response.ok) throw await parseError(response);
  if (options.raw) return response as unknown as T;
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const api = {
  get: <T>(path: string, query?: Query) => apiRequest<T>(path, { query }),
  post: <T>(path: string, body?: unknown) => apiRequest<T>(path, { method: 'POST', body: body ?? {} }),
  patch: <T>(path: string, body: unknown) => apiRequest<T>(path, { method: 'PATCH', body }),
  delete: <T = void>(path: string) => apiRequest<T>(path, { method: 'DELETE' }),
  upload: <T>(path: string, formData: FormData) => apiRequest<T>(path, { method: 'POST', formData }),
};

/** Descarga un fichero autenticado sin exponer el token en la URL. */
export async function downloadFile(path: string, fallbackName: string, query?: Query): Promise<void> {
  const response = await apiRequest<Response>(path, { query, raw: true });
  const disposition = response.headers.get('Content-Disposition') ?? '';
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1];
  const plain = /filename="([^"]+)"/i.exec(disposition)?.[1];
  const fileName = encoded ? decodeURIComponent(encoded) : (plain ?? fallbackName);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.rel = 'noopener';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
