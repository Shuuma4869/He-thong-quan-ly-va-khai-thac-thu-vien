export const loanLabels = { ACTIVE: 'Đang mượn', OVERDUE: 'Quá hạn', RETURNED: 'Đã trả' };
export const holdLabels = { WAITING: 'Đang chờ', READY: 'Sẵn sàng nhận', FULFILLED: 'Đã nhận sách', CANCELLED: 'Đã hủy', EXPIRED: 'Hết hạn nhận' };
export const formatTime = (value: string) => new Date(value).toLocaleString('vi-VN');
