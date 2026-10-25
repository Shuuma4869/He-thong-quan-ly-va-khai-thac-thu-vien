export const anomalyLabels = {
  WRONG_SHELF: 'Sai kệ', EXPECTED_BUT_MISSING: 'Chưa quét được bản dự kiến',
  STATUS_MISMATCH: 'Trạng thái không khớp', WRONG_BRANCH: 'Sai chi nhánh',
  UNKNOWN_BARCODE: 'Mã vạch không tồn tại', DUPLICATE_SCAN: 'Quét trùng',
} as const;
export const sessionLabels = { OPEN: 'Đang quét', FINALIZED: 'Đã chốt', CANCELLED: 'Đã hủy' } as const;
