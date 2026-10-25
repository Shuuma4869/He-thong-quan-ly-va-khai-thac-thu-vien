# Xếp hạng tra cứu Catalog

Đầu vào là từ khóa tối đa 500 ký tự, bộ lọc tác giả/thể loại, số trang và kích thước trang. `sort=relevance` chỉ hợp lệ khi có từ khóa. Core bỏ dấu và chuyển chữ thường bằng PostgreSQL `unaccent`; tên Book lưu thêm dạng tra cứu và `tsvector` qua trigger V22.

Ứng viên đến từ tên chứa từ khóa, full text tên/mô tả, tên gần đúng bằng `pg_trgm`, tác giả chứa từ khóa hoặc ISBN 13 đúng. Điều kiện gần đúng yêu cầu ít nhất ba ký tự. Bộ lọc tác giả và thể loại được áp dụng trước khi tính tổng/trang.

Điểm ở phiên bản đầu:

| Điều kiện ưu tiên đầu tiên | Điểm |
|---|---:|
| ISBN 13 đúng | 150 |
| Toàn bộ tên đúng | 120 |
| Tiền tố tên đúng | 80 |
| Full text tên/mô tả | 50 + min(`ts_rank_cd`, 1) × 10 |
| Tên tác giả chứa từ khóa | 45 |
| Tên chứa từ khóa | 35 |
| Tên gần đúng | `similarity` × 20 |

Mỗi Book lấy điều kiện đầu tiên khớp theo bảng; nếu bằng điểm thì ID quyết định thứ tự. Đây là quy tắc xác định, không cộng độ phổ biến hay số sao vào điểm. Rating/availability không can thiệp xếp hạng. Trang kết quả và tổng được đọc trong cùng transaction; phân trang bằng request khác có thể thay đổi khi Catalog được sửa.

Kiểm thử cần giữ: tiếng Việt có/không dấu, ISBN đúng, tên tác giả, tên đúng đứng trước tiền tố, thứ tự trang ổn định, bộ lọc, query chứa cú pháp SQL và từ khóa rỗng. Trước khi thay đổi điểm hoặc bật vector, phải benchmark trên dữ liệu có quy mô, chốt phiên bản xếp hạng và cập nhật contract/test. `pgvector` chưa được bật.
