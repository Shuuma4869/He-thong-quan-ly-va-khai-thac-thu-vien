# Giao dịch mượn, trả và giữ chỗ

## Phạm vi hiện có

V16 bổ sung schema `loans`, model/JDBC repository và policy mượn cấu hình trong Core. Chưa có HTTP command mượn/trả/gia hạn, Hold, publisher hoặc consumer nghiệp vụ ở mốc nền tảng này. Có bảng Loan không có nghĩa ứng dụng đã cho mượn được. Không có thay đổi API công khai ở bước này.

Tuan phụ trách command, transaction, policy, Hold, outbox và giao diện. Toan phụ trách query/history/filter/report/CSV theo P4-D2-01..05; không tạo API query thay phần đó. Insight không đọc/ghi trực tiếp bảng Loan.

## Loan và tính toàn vẹn

`returned_at IS NULL` là định nghĩa duy nhất của lượt mượn đang mở. Không lưu thêm chuỗi status dễ lệch khỏi thời điểm trả. Quá hạn được tính khi Loan còn mở và `due_at < now`; đúng tại hạn chưa tính quá hạn. Tất cả thời điểm dùng `TIMESTAMPTZ`/`Instant`.

Một Loan tham chiếu Copy vật lý, Reader, nhân viên cho mượn, Edition và Branch tại thời điểm mượn. Edition/Branch là tham chiếu lịch sử, không suy lại từ vị trí hoặc ấn bản hiện tại của Copy sau khi đã trả. Các FK dùng RESTRICT để không xóa dây chuyền lịch sử. Không sao chép email, họ tên hoặc token vào Loan.

- Unique index `uq_loans_active_copy` chỉ áp dụng khi chưa trả; Loan cũ đã trả không ngăn mượn lần sau.
- `due_at > borrowed_at`; thời điểm trả không trước thời điểm mượn.
- `returned_at` và `returned_by` cùng có hoặc cùng không có giá trị.
- `renewal_count` và `version` không âm.
- `policy_version` bắt buộc; `policy_snapshot` là JSON object. Command sẽ lưu snapshot chính sách đã áp dụng, không sửa hồi tố khi cấu hình đổi.
- Index theo Reader/thời gian, Reader/hạn trả đang mở, Branch/thời gian và Edition phục vụ lookup nghiệp vụ; read-side bổ sung index sau khi kiểm query plan.

Unique index không thay kiểm quyền, quota, trạng thái Copy hay đồng bộ Loan–Copy. Những kiểm tra đó phải chạy cùng transaction ở command tiếp theo. Repository yêu cầu transaction cho INSERT và SELECT FOR UPDATE; hàm policy thuần không tự khóa Reader. Code có quyền truy cập trực tiếp database vẫn có thể ghi sai quan hệ nghiệp vụ giữa Copy và Loan; hạn chế tài khoản DB và kiểm command là lớp bảo vệ bắt buộc.

## Policy phát triển — PROVISIONAL

Các giá trị dưới đây phục vụ phát triển và kiểm thử, chưa phải quy định chính thức của thư viện. Mọi thay đổi cần tăng `CIRCULATION_POLICY_VERSION`; Loan mới ghi phiên bản/snapshot mới, không thay lịch sử Loan cũ.

| Biến môi trường Core | Mặc định | Ý nghĩa |
|---|---|---|
| `CIRCULATION_POLICY_VERSION` | `dev-provisional-v1` | Mã phiên bản, 1–80 ký tự chữ/số/dấu chấm/gạch |
| `CIRCULATION_MAX_ACTIVE_LOANS` | `5` | Hạn mức đang mượn, cấu hình 1–100 |
| `CIRCULATION_LOAN_DURATION` | `P14D` | Hạn trả tính từ lúc mượn |
| `CIRCULATION_MAX_RENEWALS` | `1` | Giới hạn gia hạn, cấu hình 0–100; command chưa triển khai |
| `CIRCULATION_RENEWAL_DURATION` | `P7D` | Khoảng gia hạn; command chưa triển khai |
| `CIRCULATION_PICKUP_DURATION` | `PT48H` | Khoảng chờ nhận; Hold chưa triển khai |
| `CIRCULATION_BLOCK_OVERDUE` | `true` | Chặn mượn mới nếu còn lượt mượn quá hạn |

Duration phải nguyên giây, từ 1 giây đến 366 ngày; cấu hình thiếu/sai dừng khởi động thay vì bỏ hạn mức. Một ngày là 24 giờ thực, chưa có lịch ngày nghỉ/giờ mở cửa. Khi triển khai thực tế phải thống nhất cách tính hạn trước khi bật command.

Tài khoản phải ACTIVE và còn ít nhất một role hiện hành READER/LIBRARIAN/ADMIN, thống nhất với tài khoản thành viên đang có; staff vẫn có thể là người mượn. Quyền thực hiện command cho người khác sẽ kiểm riêng ở lớp command, không suy từ hàm xét điều kiện người mượn. LOCKED/DISABLED hoặc mất toàn bộ role đều bị từ chối. Chưa có trạng thái thẻ, tiền phạt hoặc membership bổ sung nên không giả lập các điều kiện này.

## Migration và kiểm chứng

V16 chỉ thêm bảng/index, không sửa checksum V1–V15, không backfill Loan từ status Copy. Chạy bằng Flyway trên môi trường được cấp quyền; bộ test dùng PostgreSQL Testcontainers riêng, không dùng database development/production. Forward-fix bằng migration tiếp theo, không xóa bảng có lịch sử để rollback.

`LoanSchemaTest` kiểm fresh/upgrade V15, dữ liệu Identity/Catalog/Inventory/Favorites/Reviews cũ, unique/FK/check, rollback, mapping, tham chiếu lịch sử sau bảo trì Copy và hai transaction tranh cùng Copy. Đây là cạnh tranh INSERT tại tầng DB, chưa phải E2E Borrow API. `LoanRepositoryIntegrationTest` kiểm transaction bắt buộc qua Spring proxy. `BorrowPolicyTest` kiểm role/status/quota/overdue/thời gian và binding cấu hình. `Phase3MigrationTest` giữ target V15 để tiếp tục kiểm mốc lịch sử; `CatalogIntegrationTest` khởi động với schema mới nhất để bắt regression nâng cấp.

Retention lịch sử giao dịch chưa có quy trình xóa/ẩn danh được duyệt. V16 giữ FK RESTRICT, không tự xóa Loan khi tài khoản ngừng sử dụng; việc khóa/vô hiệu hóa tài khoản không xóa lịch sử. Cần thống nhất thời hạn, quyền xuất/xóa và nghĩa vụ lưu trữ trước khi đưa dữ liệu người dùng thật vào pilot.
