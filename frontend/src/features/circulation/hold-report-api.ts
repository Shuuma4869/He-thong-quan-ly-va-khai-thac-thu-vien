import { z } from 'zod';
import { coreApi } from '../../shared/api/client';
import { reportParams } from './report-api';

const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const schema = z.object({ from: z.string().datetime(), to: z.string().datetime(), timezone: z.literal('Asia/Ho_Chi_Minh'),
  branchId: z.string().uuid().nullable(), bookId: z.string().uuid().nullable(), totalEvents: count,
  items: z.array(z.object({ date: z.string().date(), branchId: z.string().uuid(), eventType: z.string().min(1).max(40), eventCount: count })).max(10_000) });
export type HoldReportQuery = { from: string; to: string; branchId: string; bookId: string };
export type HoldReport = z.infer<typeof schema>;
export const eventLabels: Record<string, string> = {
  HOLD_CREATED: 'Tạo yêu cầu', HOLD_READY: 'Sẵn sàng nhận', HOLD_FULFILLED: 'Đã nhận sách',
  HOLD_CANCELLED: 'Hủy yêu cầu', HOLD_EXPIRED: 'Hết hạn nhận',
};
export function holdReportParams(query: HoldReportQuery) {
  const params = reportParams({ ...query, timezone: 'Asia/Ho_Chi_Minh' });
  params.delete('timezone');
  // Match Java OffsetDateTime.plusMonths in UTC, including month-end clamping.
  const from = new Date(params.get('from')!);
  const max = new Date(from);
  max.setUTCDate(1);
  max.setUTCMonth(max.getUTCMonth() + 6);
  const lastDay = new Date(Date.UTC(max.getUTCFullYear(), max.getUTCMonth() + 1, 0)).getUTCDate();
  max.setUTCDate(Math.min(from.getUTCDate(), lastDay));
  if (new Date(params.get('to')!) > max) throw new Error('Khoảng thời gian không được vượt quá 6 tháng lịch (tính theo UTC).');
  if (query.bookId) params.set('bookId', z.string().uuid().parse(query.bookId));
  return params;
}
export async function getHoldReport(query: HoldReportQuery, signal?: AbortSignal) {
  return schema.parse(await coreApi.get(`/reports/hold-activity?${holdReportParams(query)}`, true, signal));
}
export async function downloadHoldReport(query: HoldReportQuery, signal?: AbortSignal) {
  const blob = await coreApi.download(`/reports/hold-activity.csv?${holdReportParams(query)}`, signal);
  if (!blob.type.toLowerCase().startsWith('text/csv')) throw new Error('Máy chủ không trả file CSV.');
  return blob;
}
export function localDate(value: string) {
  return new Date(`${value}T00:00:00+07:00`).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
}
