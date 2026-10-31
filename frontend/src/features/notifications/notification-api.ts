import { z } from 'zod';
import { insightApi } from '../../shared/api/client';

const id = z.string().uuid();
export const notificationEvents = ['HOLD_CREATED', 'HOLD_READY', 'HOLD_EXPIRED',
  'COPY_BORROWED', 'COPY_RETURNED', 'LOAN_RENEWED', 'LOAN_DUE_REMINDER'] as const;
export type NotificationEvent = typeof notificationEvents[number];
const notification = z.object({ id, aggregateType: z.enum(['HOLD', 'LOAN']), aggregateId: id,
  eventType: z.enum(notificationEvents),
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

const titles: Record<NotificationEvent, string> = {
  HOLD_CREATED: 'Yêu cầu giữ chỗ đã được ghi nhận',
  HOLD_READY: 'Sách đã sẵn sàng nhận',
  HOLD_EXPIRED: 'Đã hết thời hạn nhận sách',
  COPY_BORROWED: 'Mượn sách thành công',
  COPY_RETURNED: 'Đã ghi nhận trả sách',
  LOAN_RENEWED: 'Gia hạn sách thành công',
  LOAN_DUE_REMINDER: 'Sắp đến hạn trả sách',
};
export const notificationTitle = (eventType: NotificationEvent) => titles[eventType];
export function notificationLink(eventType: NotificationEvent, aggregateId: string) {
  const key = eventType.startsWith('HOLD_') ? 'holdId' : 'loanId';
  const anchor = key === 'holdId' ? 'holds' : 'loans';
  return `/muon-va-giu-cho?${key}=${encodeURIComponent(id.parse(aggregateId))}#${anchor}`;
}
export const formatNotificationTime = (value: string) =>
  new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
export function notificationMessage(eventType: NotificationEvent, expiresAt: string | null) {
  if (eventType === 'HOLD_READY' && expiresAt)
    return `Nhận trước ${formatNotificationTime(expiresAt)}.`;
  switch (eventType) {
    case 'HOLD_CREATED': return 'Yêu cầu đang được xếp hàng tại chi nhánh đã chọn.';
    case 'HOLD_READY': return 'Kiểm tra trạng thái yêu cầu trước khi đến quầy.';
    case 'HOLD_EXPIRED': return 'Bạn có thể xem lại yêu cầu và tình trạng hiện tại.';
    case 'COPY_BORROWED': return 'Hạn trả được cập nhật trong danh sách đang mượn.';
    case 'COPY_RETURNED': return 'Giao dịch trả sách đã được cập nhật.';
    case 'LOAN_RENEWED': return 'Hạn trả mới có trong danh sách đang mượn.';
    case 'LOAN_DUE_REMINDER': return 'Hạn trả còn trong vòng 24 giờ. Hãy xem thông tin lượt mượn.';
  }
}
