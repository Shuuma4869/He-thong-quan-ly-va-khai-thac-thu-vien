import { ApiError } from '../../shared/api/client';

export function LibraryError({ error, retry, context = 'review' }: { error: Error; retry?: () => void; context?: 'review' | 'report' }) {
  const status = error instanceof ApiError ? error.status : 0;
  const message = status === 401 ? 'Phiên đăng nhập đã thay đổi hoặc hết hạn. Vui lòng đăng nhập lại.'
    : status === 403 ? 'Tài khoản không còn quyền thực hiện thao tác này.'
    : status === 404 ? 'Sách hoặc đánh giá không còn tồn tại. Hãy tải lại danh sách.'
    : status === 409 ? context === 'report'
      ? 'Đánh giá đã bị ẩn hoặc bạn đã gửi báo cáo cho đánh giá này. Hãy tải lại để kiểm tra.'
      : 'Dữ liệu đã thay đổi hoặc bạn đã đánh giá sách này. Hãy tải lại trước khi sửa.'
    : status === 422 ? context === 'report'
      ? 'Lý do báo cáo cần từ 10 đến 500 ký tự; bạn không thể báo cáo đánh giá của mình.'
      : 'Kiểm tra nội dung 1–5000 ký tự và điểm từ 1 đến 5.'
    : status === 429 && context === 'report' ? 'Đã đạt giới hạn gửi báo cáo. Vui lòng thử lại sau.'
    : 'Không hoàn tất yêu cầu. Nếu vừa gửi thao tác, hãy tải lại để kiểm tra trước khi gửi lại.';
  return <div role="alert" className="my-3 rounded-lg border border-line p-4"><p>{message}</p>
    {retry && status !== 401 && status !== 403 && <button type="button" className="button-secondary mt-3" onClick={retry}>Tải lại dữ liệu</button>}
  </div>;
}
