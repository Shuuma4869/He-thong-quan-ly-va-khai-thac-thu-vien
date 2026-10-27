-- Một Book/chi nhánh/cửa sổ chỉ có một đề xuất đang chờ duyệt.
-- Không xóa hoặc hợp nhất bản ghi cũ: migration dừng nếu dữ liệu hiện có vi phạm.
CREATE UNIQUE INDEX uq_acquisition_open_scope
    ON acquisition_recommendations(book_id, branch_id, window_from, window_to)
    WHERE state = 'DRAFT';
