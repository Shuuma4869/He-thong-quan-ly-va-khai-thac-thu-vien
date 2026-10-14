const coreApiUrl = import.meta.env.VITE_CORE_API_URL ?? 'http://localhost:8080/api/v1';
const insightApiUrl = import.meta.env.VITE_INSIGHT_API_URL ?? 'http://localhost:3000/api/v1';

export class ApiError extends Error {
  constructor(public readonly status: number, message: string, public readonly requestId?: string) {
    super(message);
  }
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
type AuthHooks = { token: () => string | null; refresh: () => Promise<boolean>; clear: () => void };
let authHooks: AuthHooks | null = null;
let pendingRefresh: Promise<boolean> | null = null;

export function configureCoreAuth(hooks: AuthHooks | null) { authHooks = hooks; pendingRefresh = null; }

async function request<T>(baseUrl: string, method: Method, path: string, body?: unknown, retry = true, signal?: AbortSignal): Promise<T> {
  const hooks = baseUrl === coreApiUrl ? authHooks : null;
  const token = hooks?.token();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${baseUrl}${path}`, {
    method, headers, credentials: 'include', signal, body: body === undefined ? undefined : JSON.stringify(body),
  });
  const protectedRequest = !['/auth/login', '/auth/register', '/auth/refresh', '/auth/logout'].includes(path.split('?')[0]);
  if (response.status === 401 && retry && hooks && authHooks === hooks && protectedRequest) {
    signal?.throwIfAborted();
    // A late 401 must not restore a session after logout or refresh a newer login.
    if (hooks.token() !== token) {
      if (hooks.token()) return request<T>(baseUrl, method, path, body, false, signal);
    } else {
      if (!pendingRefresh) {
        const attempt = hooks.refresh().catch(() => false).finally(() => {
          if (pendingRefresh === attempt) pendingRefresh = null;
        });
        pendingRefresh = attempt;
      }
      const refreshed = await pendingRefresh;
      signal?.throwIfAborted();
      if (refreshed && authHooks === hooks && hooks.token()) return request<T>(baseUrl, method, path, body, false, signal);
      if (authHooks === hooks && hooks.token() === token) hooks.clear();
    }
  }
  if (response.status === 401 && !retry && protectedRequest && hooks === authHooks && hooks?.token() === token) hooks?.clear();
  if (!response.ok) {
    let detail = 'Không thể hoàn tất yêu cầu.';
    let requestId = response.headers.get('X-Request-Id') ?? undefined;
    try {
      const problem = await response.json() as { detail?: string; requestId?: string };
      detail = problem.detail ?? detail;
      requestId = problem.requestId ?? requestId;
    } catch { /* Lỗi mạng/proxy có thể không trả JSON. */ }
    throw new ApiError(response.status, detail, requestId);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

function api(baseUrl: string) {
  return {
    get: <T>(path: string, retry = true, signal?: AbortSignal) => request<T>(baseUrl, 'GET', path, undefined, retry, signal),
    post: <T>(path: string, body?: unknown, retry = true) => request<T>(baseUrl, 'POST', path, body, retry),
    put: <T>(path: string, body?: unknown) => request<T>(baseUrl, 'PUT', path, body),
    patch: <T>(path: string, body?: unknown) => request<T>(baseUrl, 'PATCH', path, body),
    delete: <T>(path: string) => request<T>(baseUrl, 'DELETE', path),
  };
}

export const coreApi = api(coreApiUrl);
export const insightApi = api(insightApiUrl);
