import { useNavigate } from 'react-router-dom';
import { flushSync } from 'react-dom';
import { useAuth } from './auth-context';

export function useLogoutNavigation(destination: string) {
  const { logout } = useAuth();
  const navigate = useNavigate();
  return async () => {
    let ending: Promise<void> = Promise.resolve();
    // Chốt trạng thái khách và guard trước khi chuyển trang; API chỉ thu hồi phiên ở nền.
    flushSync(() => { ending = logout(); });
    navigate(destination, { replace: true });
    await ending.catch(() => {});
  };
}
