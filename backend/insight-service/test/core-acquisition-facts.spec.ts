import { randomUUID } from 'node:crypto';
import { CoreAcquisitionFactsAdapter } from '../src/acquisition/core-acquisition-facts.adapter';

const scope = { bookId: randomUUID(), branchId: randomUUID(),
  from: '2026-09-01T00:00:00Z', to: '2026-10-01T00:00:00Z' };
const snapshot = { contractVersion: 'acquisition-source-v1', sourceRevision: 'core-acquisition-read-v1',
  bookId: scope.bookId, branchId: scope.branchId,
  window: { from: scope.from, to: scope.to, asOf: '2026-10-01T00:00:00Z' },
  copiesOwned: 2, copiesAvailable: 1,
  waitingHolds: { count: 1, basis: 'CURRENT_STATE', source: 'holds', unavailableReason: null },
  loansStarted: { count: 2, basis: 'WINDOWED_ROWS', source: 'loans', unavailableReason: null },
  favoritesAdded: { count: null, basis: null, source: null, unavailableReason: 'Thiếu lịch sử.' } };
const adapter = new CoreAcquisitionFactsAdapter();
const oldUrl = process.env.CORE_API_URL;

beforeEach(() => { process.env.CORE_API_URL = 'http://core.test:8080/api/v1'; });
afterEach(() => {
  jest.restoreAllMocks();
  if (oldUrl === undefined) delete process.env.CORE_API_URL;
  else process.env.CORE_API_URL = oldUrl;
});

test('chuyển token tới Core, kiểm scope và giữ unavailable thay vì điền 0', async () => {
  const fetcher = jest.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(snapshot));
  const result = await adapter.load(scope, 'Bearer staff-token');
  expect(result.favoritesAdded.count).toBeNull();
  const [url, init] = fetcher.mock.calls[0];
  expect(new URL(String(url)).searchParams.get('bookId')).toBe(scope.bookId);
  expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer staff-token');
  expect(String(url)).not.toContain('staff-token');
});

test('từ chối dữ liệu sai phạm vi và lỗi nguồn', async () => {
  jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json({ ...snapshot, branchId: randomUUID() }));
  await expect(adapter.load(scope, 'Bearer staff-token')).rejects.toMatchObject({ status: 502 });
  jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json({}, { status: 404 }));
  await expect(adapter.load(scope, 'Bearer staff-token')).rejects.toMatchObject({ status: 404 });
  jest.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('offline'));
  await expect(adapter.load(scope, 'Bearer staff-token')).rejects.toMatchObject({ status: 503 });
});
