const baseUrl = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');
export function apiAssetUrl(path: string) { return path.startsWith('/api/') ? `${baseUrl}${path.slice(4)}` : path; }
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
  get temporary() { return this.status === 0 || this.status >= 500 || this.status === 429; }
}
export async function api<T>(path: string, options: { method?: string; body?: unknown; signal?: AbortSignal; expectedUserId?: string; timeoutMs?: number } = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), options.timeoutMs ?? 15000);
  const cancel = () => controller.abort();
  options.signal?.addEventListener('abort', cancel, { once: true });
  if (options.signal?.aborted) controller.abort();
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method: options.method || 'GET',
      headers: { Accept: 'application/json', ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(options.method && options.method !== 'GET' ? { 'X-AYNI-Client': 'web' } : {}), ...(options.expectedUserId ? { 'X-AYNI-User': options.expectedUserId } : {}) },
      credentials: 'include',
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
      cache: 'no-store',
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new ApiError(response.status, payload?.error?.code || 'API_ERROR', payload?.error?.message || 'No pudimos completar la operación. Inténtalo de nuevo.');
    if (!payload || !('data' in payload)) throw new ApiError(502, 'INVALID_RESPONSE', 'El servidor no devolvió una respuesta válida.');
    return payload.data as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(0, 'NETWORK_ERROR', navigator.onLine ? 'No pudimos conectar con AYNI. Revisa la conexión y vuelve a intentar.' : 'Estás sin conexión a internet.');
  } finally { window.clearTimeout(timeout); options.signal?.removeEventListener('abort', cancel); }
}
export function errorMessage(error: unknown) { return error instanceof Error ? error.message : 'No pudimos completar esta acción.'; }
export function refreshData() { window.dispatchEvent(new Event('ayni:refresh')); }
