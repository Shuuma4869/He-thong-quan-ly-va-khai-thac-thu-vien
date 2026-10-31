import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';
import { Dialog } from '../../shared/components/Dialog';
import { formatNotificationTime, listNotifications, notificationMessage, notificationTitle, unreadCount } from './notification-api';

export function NotificationBell() {
  const { user } = useAuth();
  return user ? <InboxPreview key={user.id} owner={user.id}/> : null;
}
function InboxPreview({ owner }: { owner: string }) {
  const [open, setOpen] = useState(false);
  const count = useQuery({ queryKey: ['notification-unread', owner], queryFn: ({ signal }) => unreadCount(signal),
    staleTime: 30_000, refetchInterval: 60_000, refetchIntervalInBackground: false, retry: false });
  const recent = useQuery({ queryKey: ['notifications', owner, 0], queryFn: ({ signal }) => listNotifications(0, signal),
    enabled: open, staleTime: 30_000, retry: false });
  return <>
    <button type="button" className="notification-bell icon-button" onClick={() => setOpen(true)} aria-haspopup="dialog"
      aria-label={count.data ? `Thông báo, ${count.data.count} chưa đọc` : 'Thông báo'}>
      <Bell size={20}/>{!!count.data?.count && <span aria-hidden="true">{count.data.count > 99 ? '99+' : count.data.count}</span>}
    </button>
    {open && <Dialog title="Thông báo của bạn" onClose={() => setOpen(false)}>
      <p className="text-muted text-sm">Số chưa đọc được kiểm tra mỗi phút khi ứng dụng đang mở.</p>
      {count.isError && <p role="status">Chưa cập nhật được số chưa đọc.</p>}
      {recent.isPending ? <p role="status">Đang tải thông báo…</p> : recent.isError
        ? <div role="alert"><p>Chưa tải được thông báo.</p><button className="button-secondary" onClick={() => void recent.refetch()}>Thử lại</button></div>
        : !recent.data.items.length ? <p className="empty-message">Chưa có thông báo về mượn, trả hoặc giữ chỗ.</p>
          : <ul className="notification-preview-list">{recent.data.items.slice(0, 5).map(item => <li key={item.id}>
            <div><strong>{notificationTitle(item.eventType)}</strong>
              <span className="status-label">{item.readAt ? 'Đã đọc' : 'Chưa đọc'}</span></div>
            <time dateTime={item.occurredAt}>{formatNotificationTime(item.occurredAt)}</time>
            <p>{notificationMessage(item.eventType, item.expiresAt)}</p>
          </li>)}</ul>}
      <Link className="button-primary" to="/thong-bao" onClick={() => setOpen(false)}>Mở trung tâm thông báo</Link>
    </Dialog>}
  </>;
}
