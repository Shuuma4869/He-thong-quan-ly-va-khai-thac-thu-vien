import { afterEach, expect, it, vi } from 'vitest';
import { configureCoreAuth, coreApi } from './client';

afterEach(() => {
  configureCoreAuth(null);
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it('gom hai phản hồi 401 thành một lần refresh rồi retry đúng một lần', async () => {
  let token = 'old-access';
  let finish!: (success: boolean) => void;
  const refresh = vi.fn(() => new Promise<boolean>(resolve => { finish = resolve; }));
  const clear = vi.fn();
  const fetchMock = vi.fn((_url: string, init: RequestInit) => Promise.resolve(
    init.headers && (init.headers as Record<string, string>).Authorization === 'Bearer new-access'
      ? new Response(JSON.stringify({ ok: true }), { status: 200 })
      : new Response(JSON.stringify({ detail: 'Hết hạn' }), { status: 401 }),
  ));
  vi.stubGlobal('fetch', fetchMock);
  configureCoreAuth({ token: () => token, refresh, clear });

  const first = coreApi.get<{ ok: boolean }>('/private');
  const second = coreApi.get<{ ok: boolean }>('/private');
  await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  token = 'new-access';
  finish(true);
  expect(await first).toEqual({ ok: true });
  expect(await second).toEqual({ ok: true });
  expect(fetchMock).toHaveBeenCalledTimes(4);
  expect(clear).not.toHaveBeenCalled();
});

it('auth/me cũng refresh, nhưng 401 lần hai kết thúc phiên', async () => {
  let token = 'old';
  const clear = vi.fn();
  const refresh = vi.fn(async () => { token = 'new'; return true; });
  vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(Response.json({}, { status: 401 }))));
  configureCoreAuth({ token: () => token, refresh, clear });
  await expect(coreApi.get('/auth/me')).rejects.toMatchObject({ status: 401 });
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(clear).toHaveBeenCalledTimes(1);
});

it('401 đến sau logout không khôi phục phiên hoặc gây refresh mới', async () => {
  let token: string | null = 'old';
  let finish!: (response: Response) => void;
  const refresh = vi.fn();
  const clear = vi.fn();
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { finish = resolve; })));
  configureCoreAuth({ token: () => token, refresh, clear });
  const pending = coreApi.get('/members');
  token = null;
  finish(Response.json({}, { status: 401 }));
  await expect(pending).rejects.toMatchObject({ status: 401 });
  expect(refresh).not.toHaveBeenCalled();
  expect(clear).not.toHaveBeenCalled();
});

it('403 không refresh và fetch nhận signal có thể hủy', async () => {
  const refresh = vi.fn();
  const signal = new AbortController().signal;
  const fetch = vi.fn().mockImplementation(() => Promise.resolve(Response.json({}, { status: 403 })));
  vi.stubGlobal('fetch', fetch);
  configureCoreAuth({ token: () => 'access', refresh, clear: vi.fn() });
  await expect(coreApi.get('/members', true, signal)).rejects.toMatchObject({ status: 403 });
  expect(fetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ signal: expect.any(AbortSignal) }));
  expect(refresh).not.toHaveBeenCalled();
});

it('timeout kết thúc request và không tự gửi lại POST', async () => {
  vi.useFakeTimers();
  const fetchMock = vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
    init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
  }));
  vi.stubGlobal('fetch', fetchMock);
  const assertion = expect(coreApi.post('/auth/login', {})).rejects.toMatchObject({ status: 0, reason: 'timeout' });
  await vi.advanceTimersByTimeAsync(15001);
  await assertion;
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
    credentials: 'include', headers: expect.objectContaining({ 'X-LAMS-Client': '1' }),
  }));
});

it('hủy request giữ AbortError, không biến thành lỗi mạng', async () => {
  const controller = new AbortController();
  vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
    init.signal?.addEventListener('abort', () => reject(init.signal?.reason));
  })));
  const assertion = expect(coreApi.get('/members', true, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
  controller.abort();
  await assertion;
});

it('phân biệt mất kết nối, 503 và response JSON không hợp lệ', async () => {
  const fetchMock = vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch'))
    .mockResolvedValueOnce(new Response('proxy unavailable', { status: 503 }))
    .mockResolvedValueOnce(new Response('not json', { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  await expect(coreApi.get('/health')).rejects.toMatchObject({ reason: 'network' });
  await expect(coreApi.get('/health')).rejects.toMatchObject({ status: 503 });
  await expect(coreApi.get('/health')).rejects.toMatchObject({ status: 502 });
  expect(fetchMock).toHaveBeenCalledTimes(3);
});
