import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AcquisitionController } from '../src/acquisition/acquisition.controller';
import { AcquisitionGuard } from '../src/acquisition/acquisition.guard';
import { RecommendationWorkflow } from '../src/acquisition/recommendation-workflow';
import { CoreAcquisitionFactsAdapter } from '../src/acquisition/core-acquisition-facts.adapter';

const staffId = randomUUID();
const quotaId = randomUUID();
const recommendationId = randomUUID();
const originalFetch = globalThis.fetch;
const previousCoreUrl = process.env.CORE_API_URL;
const workflow = { list: jest.fn(), get: jest.fn(), decide: jest.fn(), createDraft: jest.fn(), exportCsv: jest.fn() };
const facts = { load: jest.fn() };
let app: INestApplication;
let base: string;

beforeAll(async () => {
  const module = await Test.createTestingModule({ controllers: [AcquisitionController],
    providers: [AcquisitionGuard, { provide: RecommendationWorkflow, useValue: workflow },
      { provide: CoreAcquisitionFactsAdapter, useValue: facts }] }).compile();
  app = module.createNestApplication();
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.listen(0, '127.0.0.1');
  base = await app.getUrl();
});
beforeEach(() => {
  jest.clearAllMocks();
  process.env.CORE_API_URL = 'http://127.0.0.1:1/api/v1';
  jest.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    if (String(input) === 'http://127.0.0.1:1/api/v1/auth/me') {
      const token = (init?.headers as Record<string, string>)?.Authorization;
      if (token === 'Bearer deleted') return Response.json({}, { status: 401 });
      if (token === 'Bearer locked') return Response.json({}, { status: 403 });
      if (token === 'Bearer unavailable') throw new Error('offline');
      return Response.json({ id: token === 'Bearer quota' ? quotaId : staffId,
        roles: token === 'Bearer reader' ? ['READER'] : ['LIBRARIAN'] });
    }
    return originalFetch(input, init);
  });
});
afterEach(() => jest.restoreAllMocks());
afterAll(async () => {
  await app?.close();
  if (previousCoreUrl === undefined) delete process.env.CORE_API_URL;
  else process.env.CORE_API_URL = previousCoreUrl;
});

function request(path = '', method = 'GET', body?: unknown, token = 'staff') {
  return originalFetch(`${base}/api/v1/acquisition/recommendations${path}`, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

test.each([['', 401], ['reader', 403], ['deleted', 401], ['locked', 403], ['unavailable', 503]])
('đề xuất từ chối phiên không hợp lệ: %s', async (token, status) => {
  expect((await request('', 'GET', undefined, String(token))).status).toBe(status);
  expect(workflow.list).not.toHaveBeenCalled();
});

test('query và body thừa hoặc sai bị chặn trước workflow', async () => {
  expect((await request('?size=51')).status).toBe(400);
  expect((await request('?page=-1')).status).toBe(400);
  expect((await request('?state=UNKNOWN')).status).toBe(400);
  expect((await request('/not-a-uuid')).status).toBe(400);
  expect((await request(`/${recommendationId}/decision`, 'POST', {
    action: 'APPROVED', reason: 'Đã xem số liệu phù hợp.', expectedVersion: 0, actorId: randomUUID(),
  })).status).toBe(400);
  expect(workflow.list).not.toHaveBeenCalled();
  expect(workflow.decide).not.toHaveBeenCalled();
});

test('nhân viên xem danh sách, chi tiết và gửi quyết định bằng actor Core', async () => {
  workflow.list.mockResolvedValue({ items: [], page: { number: 1, size: 10, totalElements: 0, totalPages: 0 } });
  workflow.get.mockResolvedValue({ id: recommendationId, state: 'DRAFT', version: 0 });
  workflow.decide.mockResolvedValue({ id: recommendationId, state: 'REJECTED', version: 1 });
  const listed = await request('?page=1&size=10&state=DRAFT');
  expect(listed.status).toBe(200);
  expect(listed.headers.get('cache-control')).toBe('no-store');
  expect(workflow.list).toHaveBeenCalledWith(1, 10, 'DRAFT');
  expect((await request(`/${recommendationId}`)).status).toBe(200);
  expect(workflow.get).toHaveBeenCalledWith(recommendationId);
  const decision = await request(`/${recommendationId}/decision`, 'POST', {
    action: 'REJECTED', reason: 'Nguồn số liệu chưa đủ tin cậy.', expectedVersion: 0,
  });
  expect(decision.status).toBe(201);
  expect(workflow.decide).toHaveBeenCalledWith(recommendationId, staffId, 'REJECTED',
    'Nguồn số liệu chưa đủ tin cậy.', 0);
  expect(JSON.stringify(await decision.json())).not.toContain('Bearer');
});

test('phân tích và tạo DRAFT chỉ nhận phạm vi, tải số liệu từ Core', async () => {
  const scope = { bookId: randomUUID(), branchId: randomUUID(),
    from: '2026-09-01T00:00:00Z', to: '2026-10-01T00:00:00Z' };
  const snapshot = { contractVersion: 'acquisition-source-v1', sourceRevision: 'core-acquisition-read-v1',
    bookId: scope.bookId, branchId: scope.branchId,
    window: { from: scope.from, to: scope.to, asOf: '2026-10-01T00:00:00Z' },
    copiesOwned: 2, copiesAvailable: 1,
    waitingHolds: { count: 1, basis: 'CURRENT_STATE', source: 'holds', unavailableReason: null },
    loansStarted: { count: 2, basis: 'WINDOWED_ROWS', source: 'loans', unavailableReason: null },
    favoritesAdded: { count: null, basis: null, source: null, unavailableReason: 'Chưa có lịch sử.' } };
  facts.load.mockResolvedValue(snapshot);
  workflow.createDraft.mockResolvedValue({ id: recommendationId, state: 'DRAFT' });
  const query = new URLSearchParams(scope);
  const preview = await originalFetch(`${base}/api/v1/acquisition/analysis?${query}`,
    { headers: { Authorization: 'Bearer staff' } });
  expect(preview.status).toBe(200);
  expect((await preview.json()).score.confidence).toBe(0.85);
  const created = await request('', 'POST', scope);
  expect(created.status).toBe(201);
  expect(workflow.createDraft).toHaveBeenCalledWith(staffId, scope, snapshot);
  expect(facts.load).toHaveBeenCalledWith(scope, 'Bearer staff');
  expect((await request('', 'POST', { ...scope, waitingHolds: 999 })).status).toBe(400);
  expect(workflow.createDraft).toHaveBeenCalledTimes(1);
});

test('CSV yêu cầu quyền nhân viên, lọc trạng thái và không cache', async () => {
  workflow.exportCsv.mockResolvedValue('\uFEFFid,state\r\n"one","DRAFT"\r\n');
  const response = await originalFetch(`${base}/api/v1/acquisition/recommendations.csv?state=DRAFT`,
    { headers: { Authorization: 'Bearer staff' } });
  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toContain('text/csv');
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(workflow.exportCsv).toHaveBeenCalledWith('DRAFT');
  expect((await originalFetch(`${base}/api/v1/acquisition/recommendations.csv`,
    { headers: { Authorization: 'Bearer reader' } })).status).toBe(403);
});

test('giới hạn 60 yêu cầu mỗi phút và trả Retry-After', async () => {
  workflow.list.mockResolvedValue({ items: [], page: { number: 0, size: 20, totalElements: 0, totalPages: 0 } });
  for (let i = 0; i < 60; i++) expect((await request('', 'GET', undefined, 'quota')).status).toBe(200);
  const response = await request('', 'GET', undefined, 'quota');
  expect(response.status).toBe(429);
  expect(Number(response.headers.get('retry-after'))).toBeGreaterThan(0);
  expect(workflow.list).toHaveBeenCalledTimes(60);
});
