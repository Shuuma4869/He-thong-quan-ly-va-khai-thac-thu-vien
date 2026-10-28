import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';
import { LibraryError } from '../my-library/LibraryError';
import { listNotifications, markNotificationRead, unreadCount } from './notification-api';

export function NotificationsPage() {
  const { user } = useAuth();
  return user ? <Inbox key={user.id} owner={user.id}/> : null;
}

function Inbox({ owner }: { owner: string }) {
  const [page, setPage] = useState(0);
  const client = useQueryClient();
  const list = useQuery({ queryKey: ['notifications', owner, page],
    queryFn: ({ signal }) => listNotifications(page, signal), retry: false });
  const unread = useQuery({ queryKey: ['notification-unread', owner],
    queryFn: ({ signal }) => unreadCount(signal), retry: false });
  const mark = useMutation({ mutationFn: markNotificationRead,
    onSuccess: () => { void client.invalidateQueries({ queryKey: ['notifications', owner] });
      void client.invalidateQueries({ queryKey: ['notification-unread', owner] }); } });
  return <section className="shell py-8" aria-labelledby="notifications-heading">
    <Link to="/thu-vien-cua-toi" className="text-link">← Thư viện của tôi</Link>
    <h1 id="notifications-heading" className="page-title mt-5">Thông báo</h1>
    <p className="mt-2 text-muted">Thông báo từ yêu cầu giữ chỗ. Kiểm tra trạng thái mới nhất trước khi đến nhận sách.</p>
    {unread.isSuccess && <p className="mt-4" role="status">{unread.data.count} thông báo chưa đọc</p>}
    {unread.isError && <LibraryError error={unread.error} retry={() => void unread.refetch()}/>}
    {list.isPending ? <p role="status" className="my-6">Đang tải thông báo…</p> : list.isError
      ? <LibraryError error={list.error} retry={() => void list.refetch()}/>
      : <>{!list.data.items.length && <p className="editorial-card my-5">Bạn chưa có thông báo ở trang này.</p>}
        <ul className="my-5 grid gap-4">{list.data.items.map(item => <li key={item.id} className="editorial-card">
          <h2 className="font-semibold">{item.eventType === 'HOLD_READY' ? 'Sách đã sẵn sàng nhận' : 'Yêu cầu giữ chỗ đã hết hạn'}</h2>
          <p className="my-2">{item.eventType === 'HOLD_READY' && item.expiresAt
            ? `Nhận trước ${new Date(item.expiresAt).toLocaleString('vi-VN')}.` : 'Hãy xem lại yêu cầu giữ chỗ của bạn.'}</p>
          <p className="text-sm text-muted">Ghi nhận lúc {new Date(item.receivedAt).toLocaleString('vi-VN')}
            {item.readAt ? ' · Đã đọc' : ' · Chưa đọc'}</p>
          <div className="mt-3 flex flex-wrap gap-3"><Link className="text-link" to="/muon-va-giu-cho">Xem yêu cầu giữ chỗ</Link>
            {!item.readAt && <button type="button" className="button-secondary" disabled={mark.isPending}
              onClick={() => mark.mutate(item.id)}>Đánh dấu đã đọc</button>}</div>
        </li>)}</ul>
        {mark.isError && <LibraryError error={mark.error} retry={() => mark.reset()}/>}
        <nav className="flex items-center gap-3" aria-label="Phân trang thông báo">
          <button type="button" className="button-secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>Trước</button>
          <span>Trang {page + 1}</span>
          <button type="button" className="button-secondary" disabled={(page + 1) * 20 >= list.data.totalElements}
            onClick={() => setPage(page + 1)}>Sau</button>
        </nav></>}
  </section>;
}
