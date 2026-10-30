import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { NotificationController } from '../src/notifications/notification.controller';
import { NotificationGuard } from '../src/notifications/notification.guard';
import { NotificationRepository } from '../src/notifications/notification.repository';
import { StaffWorkInboxController } from '../src/notifications/staff-work-inbox.controller';
import { StaffWorkInboxGuard } from '../src/notifications/staff-work-inbox.guard';

const owner = randomUUID(), id = randomUUID();
const repository = { list: jest.fn(), unreadCount: jest.fn(), markRead: jest.fn(),
  listStaffWorkItems: jest.fn(), staffWorkUnreadCount: jest.fn() };
const nativeFetch = globalThis.fetch;
const previous = process.env.CORE_API_URL;
let app: INestApplication, base: string;

beforeAll(async () => {
  const module = await Test.createTestingModule({ controllers: [NotificationController, StaffWorkInboxController],
    providers: [NotificationGuard, StaffWorkInboxGuard, { provide: NotificationRepository, useValue: repository }] }).compile();
  app = module.createNestApplication(); app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
  await app.listen(0, '127.0.0.1'); base = await app.getUrl();
});
beforeEach(() => {
  jest.clearAllMocks(); process.env.CORE_API_URL = 'http://127.0.0.1:1/api/v1';
  jest.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    if (String(input) === 'http://127.0.0.1:1/api/v1/auth/me') {
      const token = (init?.headers as Record<string, string>)?.Authorization;
      if (token === 'Bearer locked') return Response.json({}, { status: 403 });
      const roles = token === 'Bearer librarian' ? ['LIBRARIAN'] : token === 'Bearer admin' ? ['ADMIN']
        : token === 'Bearer staff-no-reader' ? [] : ['READER'];
      return Response.json({ id: owner, roles });
    }
    return nativeFetch(input, init);
  });
});
afterEach(() => jest.restoreAllMocks());
afterAll(async () => { await app?.close(); if (previous === undefined) delete process.env.CORE_API_URL;
  else process.env.CORE_API_URL = previous; });
const request = (path: string, method = 'GET', token = 'reader') => nativeFetch(`${base}/api/v1/me/notifications${path}`,
  { method, headers: token ? { Authorization: `Bearer ${token}` } : {} });
const staffRequest = (path: string, token = 'reader') => nativeFetch(`${base}/api/v1/staff/work-items${path}`,
  { headers: { Authorization: `Bearer ${token}` } });

test('hộp thư lấy owner từ Core, không nhận ownerId từ query', async () => {
  repository.list.mockResolvedValue({ items: [], page: 0, size: 20, totalElements: 0 });
  expect((await request('')).status).toBe(200);
  expect(repository.list).toHaveBeenCalledWith(owner, 0, 20);
  expect((await request(`?readerId=${randomUUID()}`)).status).toBe(400);
  expect((await request('?size=51')).status).toBe(400);
  expect(repository.list).toHaveBeenCalledTimes(1);
});

test('chặn phiên lỗi; mark read chỉ tác động thông báo thuộc owner', async () => {
  expect((await request('', 'GET', '')).status).toBe(401);
  expect((await request('', 'GET', 'locked')).status).toBe(403);
  expect((await request('', 'GET', 'staff-no-reader')).status).toBe(403);
  repository.unreadCount.mockResolvedValue({ count: 2 });
  const unread = await request('/unread-count');
  expect(unread.status).toBe(200); expect(unread.headers.get('cache-control')).toBe('no-store');
  expect(await unread.json()).toEqual({ count: 2 });
  repository.markRead.mockResolvedValueOnce('NOT_FOUND').mockResolvedValueOnce('UPDATED');
  expect((await request(`/${id}/read`, 'PATCH')).status).toBe(404);
  expect((await request(`/${id}/read`, 'PATCH')).status).toBe(204);
  expect(repository.markRead).toHaveBeenCalledWith(owner, id);
  expect((await request('/not-a-uuid/read', 'PATCH')).status).toBe(400);
});

test('work inbox chỉ cho Librarian/Admin; lọc chi nhánh và kiểu công việc đã kiểm tra', async () => {
  const branchId = randomUUID();
  repository.listStaffWorkItems.mockResolvedValue({ items: [], page: 0, size: 20, totalElements: 0 });
  repository.staffWorkUnreadCount.mockResolvedValue({ count: 3 });
  expect((await staffRequest('')).status).toBe(403);
  expect((await staffRequest('', 'staff-no-reader')).status).toBe(403);
  expect((await staffRequest(`?branchId=${branchId}&workType=WAITING&page=2`, 'librarian')).status).toBe(200);
  expect(repository.listStaffWorkItems).toHaveBeenCalledWith({ branchId, workType: 'WAITING', page: 2, size: 20 });
  expect((await staffRequest('/unread-count', 'admin')).status).toBe(200);
  expect(repository.staffWorkUnreadCount).toHaveBeenCalledWith(undefined);
  expect((await staffRequest(`?branchId=${branchId}&workType=UNKNOWN`, 'admin')).status).toBe(400);
  expect((await staffRequest('/unread-count?branchId=invalid', 'admin')).status).toBe(400);
});
