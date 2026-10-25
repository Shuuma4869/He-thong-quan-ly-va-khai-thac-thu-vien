import { resolveApiConfig } from './config';

const { coreUrl: coreApiUrl, insightUrl: insightApiUrl, timeoutMs } = resolveApiConfig(import.meta.env);

export class ApiError extends Error {
  constructor(public readonly status: number, message: string, public readonly requestId?: string) {
    super(message);
  }
}

export class ApiTransportError extends ApiError {
  constructor(public readonly reason: 'network' | 'timeout') {
    super(0, reason === 'timeout'
      ? 'Máy chủ phản hồi quá lâu. Vui lòng thử lại sau.'
      : 'Không kết nối được máy chủ. Vui lòng kiểm tra mạng và thử lại.');
  }
}

async function send(url: string, init: RequestInit, signal?: AbortSignal, binary = false) {
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort(signal?.reason);
  signal?.throwIfAborted();
  signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    let data: unknown;
    if (response.status !== 204) {
      try { data = binary && response.ok ? await response.blob() : await response.json(); }
      catch (error) {
        if (controller.signal.aborted) throw error;
        if (response.ok) throw new ApiError(502, 'Máy chủ trả dữ liệu không hợp lệ.');
      }
    }
    return { response, data };
  } catch (error) {
    if (signal?.aborted) throw signal.reason ?? error;
    if (timedOut) throw new ApiTransportError('timeout');
    if (error instanceof ApiError) throw error;
    throw new ApiTransportError('network');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
type AuthHooks = { token: () => string | null; refresh: () => Promise<boolean>; clear: () => void; generation?: () => number };
let authHooks: AuthHooks | null = null;
let pendingRefresh: Promise<boolean> | null = null;

export function configureCoreAuth(hooks: AuthHooks | null) { authHooks = hooks; pendingRefresh = null; }

async function request<T>(baseUrl: string | undefined, method: Method, path: string, body?: unknown, retry = true, signal?: AbortSignal, binary = false): Promise<T> {
  if (!baseUrl) throw new ApiError(503, 'Dịch vụ này chưa được cấu hình ở môi trường hiện tại.');
  const hooks = authHooks;
  const generation = hooks?.generation?.();
  const token = hooks?.token();
  const headers: Record<string, string> = { 'Content-Type': 'application/json', 'X-LAMS-Client': '1' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const { response, data } = await send(`${baseUrl}${path}`, {
    method, headers, credentials: 'include', body: body === undefined ? undefined : JSON.stringify(body),
  }, signal, binary);
  const protectedRequest = !['/auth/login', '/auth/register', '/auth/refresh', '/auth/logout'].includes(path.split('?')[0]);
  const sameSession = () => authHooks === hooks && hooks?.generation?.() === generation;
  if (protectedRequest && !sameSession()) throw new ApiError(401, 'Phiên đăng nhập đã thay đổi.');
  if (response.status === 401 && retry && hooks && authHooks === hooks && protectedRequest) {
    signal?.throwIfAborted();
    // A late 401 must not restore a session after logout or refresh a newer login.
    if (hooks.token() !== token) {
      if (hooks.token()) return request<T>(baseUrl, method, path, body, false, signal, binary);
    } else {
      if (!pendingRefresh) {
        const attempt = hooks.refresh().catch(() => false).finally(() => {
          if (pendingRefresh === attempt) pendingRefresh = null;
        });
        pendingRefresh = attempt;
      }
      const refreshed = await pendingRefresh;
      signal?.throwIfAborted();
      if (refreshed && sameSession() && hooks.token()) return request<T>(baseUrl, method, path, body, false, signal, binary);
      if (sameSession() && hooks.token() === token) hooks.clear();
    }
  }
  if (response.status === 401 && !retry && protectedRequest && sameSession() && hooks?.token() === token) hooks?.clear();
  if (!response.ok) {
    let detail = 'Không thể hoàn tất yêu cầu.';
    let requestId = response.headers.get('X-Request-Id') ?? undefined;
    if (data && typeof data === 'object') {
      const problem = data as { detail?: unknown; requestId?: unknown };
      if (typeof problem.detail === 'string') detail = problem.detail;
      if (typeof problem.requestId === 'string') requestId = problem.requestId;
    }
    throw new ApiError(response.status, detail, requestId);
  }
  if (response.status === 204) return undefined as T;
  return data as T;
}

function api(baseUrl: string | undefined) {
  return {
    get: <T>(path: string, retry = true, signal?: AbortSignal) => request<T>(baseUrl, 'GET', path, undefined, retry, signal),
    download: (path: string, signal?: AbortSignal) => request<Blob>(baseUrl, 'GET', path, undefined, true, signal, true),
    post: <T>(path: string, body?: unknown, retry = true) => request<T>(baseUrl, 'POST', path, body, retry),
    put: <T>(path: string, body?: unknown) => request<T>(baseUrl, 'PUT', path, body),
    patch: <T>(path: string, body?: unknown) => request<T>(baseUrl, 'PATCH', path, body),
    delete: <T>(path: string) => request<T>(baseUrl, 'DELETE', path),
  };
}

export const coreApi = api(coreApiUrl);
export const insightApi = api(insightApiUrl);
