import { afterEach, expect, it, vi } from 'vitest';
import { configureCoreAuth, coreApi, insightApi } from './client';

it('Insight gửi access token và dùng chung cơ chế refresh, không chuyển token tới nhà cung cấp ảnh', async () => {
  let token='expired';
  const refresh=vi.fn(async()=>{token='current';return true;});
  const fetchMock=vi.fn((_url:string,init:RequestInit)=>Promise.resolve(Response.json(
    (init.headers as Record<string,string>).Authorization==='Bearer current'?{candidates:[]}:{detail:'Expired'}, {status:token==='current'?200:401},
  )));
  vi.stubGlobal('fetch',fetchMock);
  configureCoreAuth({token:()=>token,refresh,clear:vi.fn()});
  expect(await insightApi.get('/metadata/books/9780140328721')).toEqual({candidates:[]});
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(fetchMock.mock.calls.map(([url,init])=>[new URL(url).host,(init.headers as Record<string,string>).Authorization]))
    .toEqual([['localhost:3000','Bearer expired'],['localhost:3000','Bearer current']]);
});

afterEach(() => {
  configureCoreAuth(null);
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it('Catalog công khai không gắn token hoặc phụ thuộc thế hệ phiên', async () => {
  let generation = 1;
  const refresh = vi.fn();
  const fetchMock = vi.fn((_url: string, init: RequestInit) => {
    generation++;
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
    return Promise.resolve(Response.json({ items: [], page: { number: 0, size: 20, totalElements: 0, totalPages: 0 } }));
  });
  vi.stubGlobal('fetch', fetchMock);
  configureCoreAuth({ token: () => 'old-token', generation: () => generation, refresh, clear: vi.fn() });
  await expect(coreApi.get('/public/catalog/books?size=20')).resolves.toHaveProperty('items');
  expect(refresh).not.toHaveBeenCalled();
});

it('CSV dùng Authorization và refresh một lần, không đưa token vào URL', async () => {
  let token = 'expired'; const refresh = vi.fn(async () => { token = 'fresh'; return true; });
  const fetchMock = vi.fn((_url: string, init: RequestInit) => Promise.resolve(
    (init.headers as Record<string, string>).Authorization === 'Bearer fresh'
      ? new Response('ngày,chi nhánh\r\n', { headers: { 'Content-Type': 'text/csv;charset=UTF-8' } })
      : Response.json({ detail: 'Hết hạn' }, { status: 401 })));
  vi.stubGlobal('fetch', fetchMock); configureCoreAuth({ token: () => token, refresh, clear: vi.fn() });
  const blob = await coreApi.download('/reports/circulation.csv?from=test');
  const csv = typeof blob.text === 'function' ? await blob.text() : await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
  expect(csv).toBe('ngày,chi nhánh\r\n'); expect(refresh).toHaveBeenCalledTimes(1);
  expect(fetchMock.mock.calls.every(([url]) => !url.includes(token) && !url.includes('expired'))).toBe(true);
});

it('không trả file CSV đến muộn của tài khoản cũ', async () => {
  let generation = 1; let finish!: (value: Response) => void;
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { finish = resolve; })));
  configureCoreAuth({ token: () => 'old-token', generation: () => generation, refresh: vi.fn(), clear: vi.fn() });
  const request = coreApi.download('/reports/circulation.csv'); generation++;
  finish(new Response('dữ liệu cũ', { headers: { 'Content-Type': 'text/csv' } }));
  await expect(request).rejects.toMatchObject({ status: 401 });
});

it('CSV lỗi vẫn đọc Problem Details và request đã hủy không được trả file', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ detail: 'Khoảng thời gian quá dài' }, { status: 422 })));
  await expect(coreApi.download('/reports/circulation.csv')).rejects.toMatchObject({ status: 422, message: 'Khoảng thời gian quá dài' });
  const controller = new AbortController(); controller.abort();
  await expect(coreApi.download('/reports/circulation.csv', controller.signal)).rejects.toBeDefined();
});

it.each([200, 401])('response %s từ phiên cũ không trả dữ liệu hoặc gửi lại POST bằng tài khoản mới', async status => {
  let token = 'old-user'; let generation = 1;
  let finish!: (response: Response) => void;
  const fetchMock = vi.fn(() => new Promise<Response>(resolve => { finish = resolve; }));
  const refresh = vi.fn(); const clear = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  configureCoreAuth({ token: () => token, generation: () => generation, refresh, clear });
  const pending = insightApi.post('/metadata/history', { isbn13: '9780132350884' });
  token = 'new-user'; generation++;
  finish(Response.json({ private: 'old-user-result' }, { status }));
  await expect(pending).rejects.toMatchObject({ status: 401 });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(refresh).not.toHaveBeenCalled(); expect(clear).not.toHaveBeenCalled();
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
