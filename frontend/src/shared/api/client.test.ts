import { afterEach, expect, it, vi } from 'vitest';
import { configureCoreAuth, coreApi } from './client';

afterEach(() => {
  configureCoreAuth(null);
  vi.unstubAllGlobals();
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

it('403 không refresh và signal được chuyển đến fetch', async () => {
  const refresh = vi.fn();
  const signal = new AbortController().signal;
  const fetch = vi.fn().mockImplementation(() => Promise.resolve(Response.json({}, { status: 403 })));
  vi.stubGlobal('fetch', fetch);
  configureCoreAuth({ token: () => 'access', refresh, clear: vi.fn() });
  await expect(coreApi.get('/members', true, signal)).rejects.toMatchObject({ status: 403 });
  expect(fetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ signal }));
  expect(refresh).not.toHaveBeenCalled();
});
