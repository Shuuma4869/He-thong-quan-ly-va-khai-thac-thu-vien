import { z } from 'zod';
import { insightApi } from '../../shared/api/client';

const id = z.string().uuid();
const item = z.object({ aggregateType: z.literal('HOLD'), aggregateId: id,
  workType: z.enum(['WAITING', 'READY']), branchId: id,
  createdAt: z.string().datetime(), updatedAt: z.string().datetime() });
const page = z.object({ items: z.array(item), page: z.number().int(), size: z.number().int(),
  totalElements: z.number().int() });
export type StaffWorkItem = z.infer<typeof item>;

export async function listStaffWorkItems(filters: { page: number; branchId?: string; workType?: StaffWorkItem['workType'] },
  signal?: AbortSignal) {
  const query = new URLSearchParams({ page: String(filters.page), size: '20' });
  if (filters.branchId) query.set('branchId', id.parse(filters.branchId));
  if (filters.workType) query.set('workType', filters.workType);
  return page.parse(await insightApi.get(`/staff/work-items?${query}`, true, signal));
}

export async function staffWorkUnreadCount(branchId?: string, signal?: AbortSignal) {
  const query = branchId ? `?branchId=${encodeURIComponent(id.parse(branchId))}` : '';
  return z.object({ count: z.number().int().nonnegative() })
    .parse(await insightApi.get(`/staff/work-items/unread-count${query}`, true, signal));
}
