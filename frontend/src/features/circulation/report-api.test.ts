import { expect, it } from 'vitest';
import { reportParams, type ReportQuery } from './report-api';

const query: ReportQuery = { from: '2026-10-01', to: '2026-11-01', timezone: 'Asia/Ho_Chi_Minh', branchId: '' };
it('chuyển mốc ngày Việt Nam sang UTC và giữ khoảng kết thúc mở', () => {
  expect(Object.fromEntries(reportParams(query))).toEqual({ from: '2026-09-30T17:00:00.000Z', to: '2026-10-31T17:00:00.000Z', timezone: 'Asia/Ho_Chi_Minh' });
  expect(reportParams({ ...query, timezone: 'UTC' }).get('from')).toBe('2026-10-01T00:00:00.000Z');
});
it.each(['2025-02-29', '2026-02-30', '2026-04-31', '0000-10-01', '2026-13-01', '2026-1-1', ''])('từ chối ngày không tồn tại: %s', from => {
  expect(() => reportParams({ ...query, from })).toThrow();
});
it('nhận ngày nhuận, đúng 366 ngày; chặn khoảng đảo, quá dài và năm UTC ngoài contract', () => {
  expect(reportParams({ ...query, from: '2024-02-29', to: '2025-03-01' }).get('from')).toContain('2024-02-28T17:00');
  for (const change of [{ from: query.to }, { to: '2026-09-01' }, { to: '2027-10-03' }, { from: '0001-01-01', to: '0001-01-02' }])
    expect(() => reportParams({ ...query, ...change })).toThrow();
});
it('chỉ nhận UUID chi nhánh và múi giờ được hỗ trợ', () => {
  const branchId = '11111111-1111-4111-8111-111111111111';
  expect(reportParams({ ...query, branchId }).get('branchId')).toBe(branchId);
  expect(() => reportParams({ ...query, branchId: '1 OR 1=1' })).toThrow();
  expect(() => reportParams({ ...query, timezone: 'Europe/Paris' as ReportQuery['timezone'] })).toThrow();
});
