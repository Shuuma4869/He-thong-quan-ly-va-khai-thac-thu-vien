import { z } from 'zod';
import { insightApi } from '../../shared/api/client';

const id = z.string().uuid();
const notification = z.object({ id, holdId: id, eventType: z.enum(['HOLD_READY', 'HOLD_EXPIRED']),
  occurredAt: z.string().datetime(), receivedAt: z.string().datetime(),
  expiresAt: z.string().datetime().nullable(), readAt: z.string().datetime().nullable() });
const page = z.object({ items: z.array(notification), page: z.number().int(), size: z.number().int(),
  totalElements: z.number().int() });

export async function listNotifications(number: number, signal?: AbortSignal) {
  return page.parse(await insightApi.get(`/me/notifications?page=${number}&size=20`, true, signal));
}
export async function unreadCount(signal?: AbortSignal) {
  return z.object({ count: z.number().int().nonnegative() })
    .parse(await insightApi.get('/me/notifications/unread-count', true, signal));
}
export function markNotificationRead(idValue: string) {
  return insightApi.patch<void>(`/me/notifications/${id.parse(idValue)}/read`);
}
