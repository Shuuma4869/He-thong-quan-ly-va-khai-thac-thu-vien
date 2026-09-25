const coreApiUrl = import.meta.env.VITE_CORE_API_URL ?? 'http://localhost:8080/api/v1';
const insightApiUrl = import.meta.env.VITE_INSIGHT_API_URL ?? 'http://localhost:3000/api/v1';

export class ApiError extends Error {
  constructor(public readonly status: number, message: string, public readonly requestId?: string) {
    super(message);
  }
}

async function request<T>(baseUrl: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!response.ok) {
    throw new ApiError(response.status, 'Không thể hoàn tất yêu cầu.', response.headers.get('x-request-id') ?? undefined);
  }
  return response.json() as Promise<T>;
}

export const coreApi = { get: <T>(path: string) => request<T>(coreApiUrl, path) };
export const insightApi = { get: <T>(path: string) => request<T>(insightApiUrl, path) };
