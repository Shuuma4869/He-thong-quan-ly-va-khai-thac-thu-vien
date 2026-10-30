import { useQuery } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';
import { staffWorkUnreadCount } from './staff-work-inbox-api';

export function StaffWorkInboxBell() {
  const { user } = useAuth();
  const count = useQuery({ queryKey: ['staff-work-inbox', user?.id, 'unread-count'],
    queryFn: ({ signal }) => staffWorkUnreadCount(undefined, signal), enabled: !!user,
    staleTime: 30_000, refetchInterval: 60_000, refetchIntervalInBackground: false, retry: false });
  return <Link to="/nhan-vien/hop-thu" className="notification-bell icon-button"
    aria-label={count.data ? `Hộp thư công việc, ${count.data.count} việc đang mở` : 'Hộp thư công việc'}
    title="Hộp thư công việc">
    <Bell size={20}/>{!!count.data?.count && <span aria-hidden="true">{count.data.count > 99 ? '99+' : count.data.count}</span>}
  </Link>;
}
