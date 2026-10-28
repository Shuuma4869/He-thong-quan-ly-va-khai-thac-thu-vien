import type { ExecutionContext } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { NotificationGuard, notificationActor } from '../src/notifications/notification.guard';

const id = randomUUID();
const original = process.env.CORE_API_URL;
const context = (authorization?: string, setHeader = jest.fn()) => {
  const request = { headers: { authorization } };
  const execution = { switchToHttp: () => ({ getRequest: () => request,
    getResponse: () => ({ setHeader }) }) } as unknown as ExecutionContext;
  return { request, execution, setHeader };
};
beforeEach(() => { process.env.CORE_API_URL = 'http://localhost:8080/api/v1'; });
afterEach(() => { jest.restoreAllMocks(); if (original === undefined) delete process.env.CORE_API_URL;
  else process.env.CORE_API_URL = original; });

test('Core xác thực từng request và chỉ nhận tài khoản còn role hiện hành', async () => {
  const fetch = jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json({ id, roles: ['READER'] }))
    .mockResolvedValueOnce(Response.json({ id, roles: [] }));
  const guard = new NotificationGuard();
  const first = context('Bearer token');
  expect(await guard.canActivate(first.execution)).toBe(true);
  expect((first.request as typeof first.request & { [notificationActor]?: string })[notificationActor]).toBe(id);
  await expect(guard.canActivate(context('Bearer token').execution)).rejects.toMatchObject({ status: 403 });
  expect(fetch).toHaveBeenCalledTimes(2);
});

test('token sai, Core lỗi và giới hạn truy cập đều đóng an toàn', async () => {
  const guard = new NotificationGuard();
  const fetch = jest.spyOn(globalThis, 'fetch');
  await expect(guard.canActivate(context('Basic invalid').execution)).rejects.toMatchObject({ status: 401 });
  expect(fetch).not.toHaveBeenCalled();
  fetch.mockRejectedValueOnce(new Error('offline'));
  await expect(guard.canActivate(context('Bearer token').execution)).rejects.toMatchObject({ status: 503 });
  fetch.mockImplementation(async () => Response.json({ id, roles: ['READER'] }));
  for (let attempt = 0; attempt < 120; attempt++) expect(await guard.canActivate(context('Bearer token').execution)).toBe(true);
  const limited = context('Bearer token');
  await expect(guard.canActivate(limited.execution)).rejects.toMatchObject({ status: 429 });
  expect(limited.setHeader).toHaveBeenCalledWith('Retry-After', expect.any(String));
});
