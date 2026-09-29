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
