import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadHoldReport, getHoldReport, holdReportParams } from './hold-report-api';
const branchId = '11111111-1111-4111-8111-111111111111';
const bookId = '22222222-2222-4222-8222-222222222222';
const query = { from: '2026-01-01', to: '2026-02-01', branchId: '', bookId: '' };
afterEach(() => vi.unstubAllGlobals());
describe('kỳ hoạt động giữ chỗ', () => {
  it('giữ cửa sổ nửa mở, giờ Việt Nam và cả hai bộ lọc trên JSON/CSV', async () => {
    const mock = vi.fn().mockResolvedValueOnce(Response.json({ from: '2025-12-31T17:00:00Z', to: '2026-01-31T17:00:00Z',
      timezone: 'Asia/Ho_Chi_Minh', branchId, bookId, totalEvents: 2,
      items: [{ date: '2026-01-01', branchId, eventType: 'HOLD_READY', eventCount: 2 }] }))
      .mockResolvedValueOnce(new Response('\uFEFFfrom,to', { headers: { 'Content-Type': 'text/csv;charset=UTF-8' } }));
    vi.stubGlobal('fetch', mock);
    const filter = { ...query, branchId, bookId };
    expect((await getHoldReport(filter)).totalEvents).toBe(2);
    await downloadHoldReport(filter);
    const urls = mock.mock.calls.map(([url]) => new URL(url));
    expect(urls[0].search).toBe(urls[1].search);
    expect(urls[0].searchParams.get('from')).toBe('2025-12-31T17:00:00.000Z');
    expect(urls[0].searchParams.get('to')).toBe('2026-01-31T17:00:00.000Z');
    expect(urls[0].searchParams.get('bookId')).toBe(bookId);
    expect(urls[0].searchParams.has('timezone')).toBe(false);
  });
  it.each([
    ['2026-01-01', '2026-07-01', true], ['2026-01-01', '2026-07-02', false],
    ['2026-09-01', '2027-03-01', true], ['2026-09-01', '2027-03-02', false],
    ['2026-02-29', '2026-03-01', false], ['2028-02-29', '2028-03-01', true],
    ['2026-03-01', '2026-03-01', false], ['2026-04-01', '2026-03-01', false],
  ])('%s → %s, hợp lệ %s', (from, to, allowed) => {
    const parse = () => holdReportParams({ ...query, from, to });
    if (allowed) expect(parse).not.toThrow(); else expect(parse).toThrow();
  });
  it('từ chối định danh sai trước khi gửi request', () => {
    expect(() => holdReportParams({ ...query, branchId: "' OR 1=1" })).toThrow();
    expect(() => holdReportParams({ ...query, bookId: 'bad-id' })).toThrow();
  });
  it('không tải phản hồi HTML thành CSV', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html/>', { headers: { 'Content-Type': 'text/html' } })));
    await expect(downloadHoldReport(query)).rejects.toThrow('CSV');
  });
});
