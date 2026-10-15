import { ApiError } from '../../shared/api/client';

export function MemberRequestError({ error, retry }: { error: unknown; retry: () => void }) {
  const forbidden = error instanceof ApiError && error.status === 403;
  const message = forbidden ? 'Bạn không còn quyền xem nội dung này hoặc tài khoản đã ngừng hoạt động.'
    : error instanceof ApiError && error.status === 401 ? 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.'
    : 'Không tải được dữ liệu. Vui lòng kiểm tra kết nối và thử lại.';
  return <div role="alert" className="editorial-card my-5">
    <p>{message}</p>
    {error instanceof ApiError && error.requestId && <p className="mt-2 break-all text-sm text-muted">Mã yêu cầu: {error.requestId}</p>}
    {!forbidden && <button type="button" className="button-secondary mt-4" onClick={retry}>Thử lại</button>}
  </div>;
}
