export const loanLabels = { ACTIVE: 'Đang mượn', OVERDUE: 'Quá hạn', RETURNED: 'Đã trả' };
export const holdLabels = { WAITING: 'Đang chờ', READY: 'Sẵn sàng nhận', FULFILLED: 'Đã nhận sách', CANCELLED: 'Đã hủy', EXPIRED: 'Hết hạn nhận' };
export const copyLabels: Record<string, string> = { IN_PROCESS: 'Đang xử lý', AVAILABLE: 'Sẵn sàng cho mượn',
  ON_LOAN: 'Đang được mượn', ON_HOLD: 'Đang giữ cho bạn đọc', LOST: 'Thất lạc', DAMAGED: 'Hư hỏng', WITHDRAWN: 'Đã thanh lý' };
export const formatTime = (value: string) => new Date(value).toLocaleString('vi-VN');
