import { z } from 'zod';
import { coreApi } from '../../shared/api/client';

const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const totals = z.object({ borrowed: count, active: count, returned: count, overdue: count });
const reportSchema = z.object({ from: z.string().datetime(), to: z.string().datetime(), asOf: z.string().datetime(),
  timezone: z.enum(['UTC', 'Asia/Ho_Chi_Minh']), totals,
  items: z.array(totals.extend({ date: z.string(), branchId: z.string().uuid(), branchName: z.string() })) });
export type ReportQuery = { from: string; to: string; timezone: 'UTC' | 'Asia/Ho_Chi_Minh'; branchId: string };
export function reportParams(query: ReportQuery) {
  const validDate = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000-')) return false;
    const parsed = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  };
  if (!validDate(query.from) || !validDate(query.to)) throw new Error('Chọn đủ hai ngày hợp lệ.');
  z.enum(['UTC', 'Asia/Ho_Chi_Minh']).parse(query.timezone);
  const offset = query.timezone === 'UTC' ? 'Z' : '+07:00';
  const from = new Date(`${query.from}T00:00:00${offset}`), to = new Date(`${query.to}T00:00:00${offset}`);
  if (from.getUTCFullYear() < 1 || from >= to || to.getTime() - from.getTime() > 366 * 86400000)
    throw new Error('Ngày kết thúc phải sau ngày bắt đầu và khoảng thời gian không quá 366 ngày.');
  const params = new URLSearchParams({ from: from.toISOString(), to: to.toISOString(), timezone: query.timezone });
  if (query.branchId) params.set('branchId', z.string().uuid().parse(query.branchId));
  return params;
}
export async function getReport(query: ReportQuery, signal?: AbortSignal) {
  return reportSchema.parse(await coreApi.get(`/reports/circulation?${reportParams(query)}`, true, signal));
}
export async function downloadReport(query: ReportQuery, signal?: AbortSignal) {
  const blob = await coreApi.download(`/reports/circulation.csv?${reportParams(query)}`, signal);
  if (!blob.type.toLowerCase().startsWith('text/csv')) throw new Error('Máy chủ không trả file CSV.');
  return blob;
}
