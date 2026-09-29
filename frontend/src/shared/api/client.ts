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

export function configureCoreAuth(hooks: AuthHooks | null) { authHooks = hooks; }

async function request<T>(baseUrl: string, method: Method, path: string, body?: unknown, retry = true): Promise<T> {
  const token = baseUrl === coreApiUrl ? authHooks?.token() : null;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${baseUrl}${path}`, {
    method, headers, credentials: 'include', body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (response.status === 401 && retry && baseUrl === coreApiUrl && authHooks && !path.startsWith('/auth/login')
      && !path.startsWith('/auth/register') && !path.startsWith('/auth/refresh') && !path.startsWith('/auth/logout')) {
    pendingRefresh ??= authHooks.refresh().finally(() => { pendingRefresh = null; });
    if (await pendingRefresh) return request<T>(baseUrl, method, path, body, false);
    authHooks.clear();
  }
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
    get: <T>(path: string, retry = true) => request<T>(baseUrl, 'GET', path, undefined, retry),
    post: <T>(path: string, body?: unknown, retry = true) => request<T>(baseUrl, 'POST', path, body, retry),
    put: <T>(path: string, body?: unknown) => request<T>(baseUrl, 'PUT', path, body),
    patch: <T>(path: string, body?: unknown) => request<T>(baseUrl, 'PATCH', path, body),
    delete: <T>(path: string) => request<T>(baseUrl, 'DELETE', path),
  };
}

export const coreApi = api(coreApiUrl);
export const insightApi = api(insightApiUrl);
