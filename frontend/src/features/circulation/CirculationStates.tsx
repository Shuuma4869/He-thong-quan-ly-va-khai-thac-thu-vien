import { ApiError } from '../../shared/api/client';

export function CirculationError({ error, reload }: { error: Error; reload?: () => void }) {
  const status = error instanceof ApiError ? error.status : 0;
  const message = status === 401 ? 'Phiên đăng nhập đã thay đổi. Vui lòng đăng nhập lại.'
    : status === 403 ? 'Tài khoản không còn quyền thực hiện thao tác này.'
    : status === 404 ? 'Không tìm thấy giao dịch hoặc dữ liệu liên quan. Hãy tải lại danh sách.'
    : status === 409 || status === 422 || status === 400 ? error.message
    : 'Chưa xác định được kết quả. Nếu đã gửi lệnh, hãy kiểm tra lại dữ liệu hoặc thử lại đúng yêu cầu này.';
  return <div role="alert" className="editorial-card my-3"><p>{message}</p>
    {reload && status !== 401 && status !== 403 && <button className="button-secondary mt-3" type="button" onClick={reload}>Tải lại dữ liệu</button>}
  </div>;
}
