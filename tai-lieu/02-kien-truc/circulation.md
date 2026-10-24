# Giao dịch mượn, trả và giữ chỗ

## Phạm vi hiện có

V16 bổ sung `loans` và policy; V17 bổ sung biên nhận lệnh và lịch sử trạng thái Copy; V18 bổ sung `holds`, `hold_changes`, `loan_extensions`. Core có lệnh mượn/trả/gia hạn, tạo/hủy/nhận giữ chỗ, phân bổ và hết hạn; có query giữ chỗ cá nhân/hàng chờ. Query Loan, báo cáo, giao diện lưu thông và Kafka delivery chưa hoàn thành ở mốc này. Không dùng API bảo trì để giả lập mượn/trả.

Phân công ban đầu: Tuan phụ trách command/transaction/policy/Hold/outbox/giao diện; Toan phụ trách query/history/filter/report/CSV P4-D2-01..05. Từ ngày 24/10/2026, phần còn thiếu của cả hai nhóm task Phase 4–6 được tiếp tục tích hợp trên nhánh Tuan theo quyết định của nhóm; giữ nguyên nhánh và lịch sử commit Toan. Insight không đọc/ghi trực tiếp bảng Loan.

## Lệnh, khóa và gửi lại yêu cầu

Mỗi lệnh nhận `requestId` UUID do client tạo. Biên nhận dùng khóa `(actor_id, request_id)` chung cho mọi loại lệnh; cùng key nhưng khác loại/nội dung trả 409. Lệnh thành công lưu response trong cùng transaction với nghiệp vụ. Gửi lại trả **snapshot response gốc**, không thực hiện lại và không coi đó là truy vấn hiện trạng. HTTP mượn vẫn trả 201 khi replay. Lệnh lỗi không lưu biên nhận; client có thể gửi lại cùng key sau khi xử lý nguyên nhân. Quyền và trạng thái nhân viên được kiểm cả khi replay.

Thứ tự khóa: key yêu cầu → người mượn (Borrow, Renew, tạo Hold) → Book → Copy → Loan (Return/Renew). Khóa người mượn `FOR NO KEY UPDATE` bảo vệ kiểm quota giữa những Copy khác nhau mà vẫn cho phép kiểm FK bằng KEY SHARE. Khóa Book là advisory transaction theo namespace; va chạm hash chỉ làm chờ, không dùng hash để nhận diện dữ liệu. Copy được khóa `FOR UPDATE OF c`, sau đó kiểm lại Book/version do bảo trì có thể đã đổi ấn bản trong lúc chờ. Không khóa Shelf sau Copy để tránh đảo thứ tự với maintenance vốn khóa Shelf trước khi UPDATE Copy. Thời gian chờ khóa tối đa 5 giây; conflict/deadlock trả 409 sau rollback. Giới hạn này không thay rate limit ở tầng triển khai.

Borrow nhận Copy AVAILABLE khi không có hàng chờ phù hợp đủ điều kiện, hoặc ON_HOLD dành cho đúng người nhận trước hạn. Khóa Reader rồi mới đếm active Loan/kiểm overdue; kiểm chi nhánh ACTIVE và Copy version. Tạo Loan với policy snapshot, đổi Copy ON_LOAN, đóng Hold FULFILLED nếu có, ghi audit/outbox cùng transaction. Return khóa Copy rồi Loan, kiểm Loan version/chi nhánh, đóng Loan và chuyển Copy AVAILABLE; listener đồng bộ phân bổ ngay cho hàng chờ trước commit, nên trạng thái cuối có thể là ON_HOLD. Response trả Copy version sau phân bổ. Reader bị khóa vẫn được trả. Return lần hai với key mới trả 409; retry key cũ trả kết quả gốc. Chưa có nhận/trả khác chi nhánh, tiền phạt hoặc đóng Loan do mất sách; không mở các transition đó qua API bảo trì.

API bảo trì chỉ cho IN_PROCESS → AVAILABLE/WITHDRAWN, AVAILABLE → LOST/DAMAGED, DAMAGED → IN_PROCESS/WITHDRAWN, LOST → IN_PROCESS. Bắt buộc lý do/version, kiểm quyền hiện hành và không còn Loan mở. Mỗi thay đổi tăng Copy version, ghi trạng thái trước/sau, actor và thời điểm. WITHDRAWN không có đường khôi phục thông thường. Trường version mới chỉ nhận số nguyên JSON int64, không tự cắt phần thập phân.

Trạng thái event: **OUTBOX_IMPLEMENTED / KAFKA_DELIVERY_PENDING**. COPY_BORROWED/COPY_RETURNED/LOAN_RENEWED và HOLD_CREATED/READY/FULFILLED/CANCELLED/EXPIRED nằm trong `outbox_events` sau commit; chưa có dispatcher hay consumer. `version=1` là phiên bản envelope; `aggregateVersion` là version Loan/Hold để consumer sau này xử lý sự kiện đến sai thứ tự. Không gửi Kafka trong transaction và không cam kết exactly-once.

## Loan và tính toàn vẹn

`returned_at IS NULL` là định nghĩa duy nhất của lượt mượn đang mở. Không lưu thêm chuỗi status dễ lệch khỏi thời điểm trả. Quá hạn được tính khi Loan còn mở và `due_at < now`; đúng tại hạn chưa tính quá hạn. Tất cả thời điểm dùng `TIMESTAMPTZ`/`Instant`.

Một Loan tham chiếu Copy vật lý, Reader, nhân viên cho mượn, Edition và Branch tại thời điểm mượn. Edition/Branch là tham chiếu lịch sử, không suy lại từ vị trí hoặc ấn bản hiện tại của Copy sau khi đã trả. Các FK dùng RESTRICT để không xóa dây chuyền lịch sử. Không sao chép email, họ tên hoặc token vào Loan.

- Unique index `uq_loans_active_copy` chỉ áp dụng khi chưa trả; Loan cũ đã trả không ngăn mượn lần sau.
- `due_at > borrowed_at`; thời điểm trả không trước thời điểm mượn.
- `returned_at` và `returned_by` cùng có hoặc cùng không có giá trị.
- `renewal_count` và `version` không âm.
- `policy_version` bắt buộc; `policy_snapshot` là JSON object. Command sẽ lưu snapshot chính sách đã áp dụng, không sửa hồi tố khi cấu hình đổi.
- Index theo Reader/thời gian, Reader/hạn trả đang mở, Branch/thời gian và Edition phục vụ lookup nghiệp vụ; read-side bổ sung index sau khi kiểm query plan.

Unique index không thay kiểm quyền, quota, trạng thái Copy hay đồng bộ Loan–Copy. Command thực hiện các kiểm tra đó cùng transaction. Repository yêu cầu transaction cho INSERT và SELECT FOR UPDATE; hàm policy thuần không tự khóa Reader. Code có quyền truy cập trực tiếp database vẫn có thể ghi sai quan hệ nghiệp vụ giữa Copy và Loan; hạn chế tài khoản DB và kiểm command là lớp bảo vệ bắt buộc.

## Policy phát triển — PROVISIONAL

Các giá trị dưới đây phục vụ phát triển và kiểm thử, chưa phải quy định chính thức của thư viện. Mọi thay đổi cần tăng `CIRCULATION_POLICY_VERSION`; Loan mới ghi phiên bản/snapshot mới, không thay lịch sử Loan cũ.

| Biến môi trường Core | Mặc định | Ý nghĩa |
|---|---|---|
| `CIRCULATION_POLICY_VERSION` | `dev-provisional-v1` | Mã phiên bản, 1–80 ký tự chữ/số/dấu chấm/gạch |
| `CIRCULATION_MAX_ACTIVE_LOANS` | `5` | Hạn mức đang mượn, cấu hình 1–100 |
| `CIRCULATION_LOAN_DURATION` | `P14D` | Hạn trả tính từ lúc mượn |
| `CIRCULATION_MAX_RENEWALS` | `1` | Giới hạn gia hạn, cấu hình 0–100 |
| `CIRCULATION_RENEWAL_DURATION` | `P7D` | Khoảng gia hạn cộng vào hạn trả cũ |
| `CIRCULATION_PICKUP_DURATION` | `PT48H` | Khoảng chờ nhận từ lúc READY; chụp giá trị khi tạo Hold |
| `CIRCULATION_BLOCK_OVERDUE` | `true` | Chặn mượn mới nếu còn lượt mượn quá hạn |
| `CIRCULATION_MAX_ACTIVE_HOLDS` | `10` | Hạn mức WAITING/READY mỗi người, cấu hình 1–100 |
| `CIRCULATION_HOLD_JOB_ENABLED` | `true` | Bật quét hết hạn và phân bổ hàng chờ |
| `CIRCULATION_HOLD_JOB_DELAY_MS` | `30000` | Khoảng nghỉ giữa các lượt quét, tính bằng mili giây |

Duration phải nguyên giây, từ 1 giây đến 366 ngày; cấu hình thiếu/sai dừng khởi động thay vì bỏ hạn mức. Một ngày là 24 giờ thực, chưa có lịch ngày nghỉ/giờ mở cửa. Khi triển khai thực tế phải thống nhất cách tính hạn trước khi bật command.

Tài khoản phải ACTIVE và còn ít nhất một role hiện hành READER/LIBRARIAN/ADMIN, thống nhất với tài khoản thành viên đang có; staff vẫn có thể là người mượn. Quyền thực hiện command cho người khác sẽ kiểm riêng ở lớp command, không suy từ hàm xét điều kiện người mượn. LOCKED/DISABLED hoặc mất toàn bộ role đều bị từ chối. Chưa có trạng thái thẻ, tiền phạt hoặc membership bổ sung nên không giả lập các điều kiện này.

## Giữ chỗ và gia hạn

Hold gắn với Book và chi nhánh nhận. Người đọc chọn một Edition cụ thể hoặc chủ động chấp nhận bất kỳ Edition nào; hai lựa chọn không được cùng có hiệu lực. UI phải mặc định ấn bản đang xem và giải thích việc khác ISBN/ngôn ngữ nếu chọn bất kỳ. Unique index bảo vệ một WAITING/READY cho mỗi người/Book trên mọi chi nhánh, và một READY cho mỗi Copy. Muốn đổi phạm vi phải hủy/tạo mới, nhận vị trí mới.

Phân bổ theo `queued_at, id` tăng dần trong số yêu cầu cùng Book/chi nhánh và phù hợp Edition. Tạm bỏ qua người không còn đủ điều kiện mượn nhưng giữ vị trí gốc của họ; không thu hồi Copy đã READY cho người khác khi tài khoản được kích hoạt lại. Tạo Hold vẫn được phép khi đã đầy quota mượn. READY chỉ giữ Copy, không bảo đảm quota lúc tới nhận: Borrow kiểm lại dưới khóa Reader. Phân bổ không khóa Reader sau Book để tránh đảo thứ tự khóa.

WAITING → READY khi có Copy; READY → FULFILLED khi nhận; WAITING/READY → CANCELLED bởi chủ yêu cầu; READY → EXPIRED khi hết hạn. Hủy/hết hạn READY giải phóng và phân bổ Copy tiếp trong cùng transaction. Đúng `expires_at` không còn được nhận, dù job chưa chạy. Job quét tối đa 100 Book/lượt theo con trỏ UUID, mỗi Book đóng tối đa 100 READY hết hạn rồi phân bổ. Lỗi một Book không chặn Book khác; vòng sau thử lại. Nhiều instance cùng khóa Book, không nhân đôi phân bổ. Tắt job không vô hiệu hóa kiểm hạn lúc nhận; việc giải phóng Copy hết hạn sẽ chờ bật lại.

`GET /me/holds` chỉ lấy principal hiện tại. `GET /holds/{id}` dành cho chủ hoặc staff; `/holds/queue` chỉ staff. Vị trí hàng chờ là vị trí chung của Book tại Branch, không phải thứ tự chắc chắn được nhận vì Edition và điều kiện người đọc khác nhau. Chưa cung cấp ETA theo ngày. Số lượng hàng chờ mỗi Book chưa giới hạn; thuật toán hiện đọc các yêu cầu WAITING của Book trong một transaction, cần đo tải và tối ưu trước khi phục vụ hàng đợi lớn.

`POST /loans/{id}/renew` cho chủ lượt mượn hoặc staff. Người mượn phải còn ACTIVE/quyền đọc, Loan mở đúng version, Copy ON_LOAN tại chi nhánh ACTIVE, chưa tới hạn trả và chưa hết số lần gia hạn. Nếu bật `blockOverdue`, các Loan quá hạn khác cũng chặn. Bất kỳ WAITING phù hợp tại chi nhánh đó đều chặn gia hạn, kể cả người chờ đang tạm không đủ quota; giữ quyền ưu tiên cho hàng chờ. Hạn mới tính từ hạn cũ, không từ thời điểm bấm nút. `loan_extensions` ghi actor, hạn trước/sau, thời điểm và policy hiện hành; không sửa snapshot gốc lúc mượn.

Giới hạn: chưa có staff hủy thay, tự xóa WAITING khi tài khoản ngừng dùng, đổi chi nhánh nhận, lịch ngày nghỉ hay SLA phân bổ. Tài khoản bị khóa không được gửi mutation; READY vẫn hết hạn bình thường, WAITING bị bỏ qua cho tới khi hoạt động lại. Trước pilot cần chốt cách kết thúc hàng chờ của tài khoản ngừng sử dụng và retention. Không tự xóa lịch sử hoặc dữ liệu production.

## Migration và kiểm chứng

V16 chỉ thêm bảng/index, không sửa checksum V1–V15, không backfill Loan từ status Copy. Chạy bằng Flyway trên môi trường được cấp quyền; bộ test dùng PostgreSQL Testcontainers riêng, không dùng database development/production. Forward-fix bằng migration tiếp theo, không xóa bảng có lịch sử để rollback.

`LoanSchemaTest` kiểm fresh/upgrade V15, dữ liệu Identity/Catalog/Inventory/Favorites/Reviews cũ, unique/FK/check, rollback, mapping, tham chiếu lịch sử sau bảo trì Copy và hai transaction tranh cùng Copy. Đây là cạnh tranh INSERT tại tầng DB, chưa phải E2E Borrow API. `LoanRepositoryIntegrationTest` kiểm transaction bắt buộc qua Spring proxy. `BorrowPolicyTest` kiểm role/status/quota/overdue/thời gian và binding cấu hình. `Phase3MigrationTest` giữ target V15 để tiếp tục kiểm mốc lịch sử; `CatalogIntegrationTest` khởi động với schema mới nhất để bắt regression nâng cấp.

`LoanCommandIntegrationTest` kiểm API, quyền hiện hành, replay sau Return, key sai nội dung, rollback toàn bộ Loan/Copy/audit/outbox/receipt, tranh Copy cuối và quota giữa hai Book. Kiểm chờ khóa dùng `pg_blocking_pids`, không suy ra thành công chỉ từ thời gian chạy. `LoanSchemaTest` giữ mốc V16 và thêm nâng V16 → V17 có Loan cũ; Catalog chạy migration mới nhất. Các kết quả chạy cụ thể gắn với commit/CI trong PR, không thay bằng chứng web/EXE.

Retention lịch sử giao dịch chưa có quy trình xóa/ẩn danh được duyệt. Loan, audit và biên nhận giữ FK RESTRICT; khóa/vô hiệu hóa tài khoản không xóa lịch sử. Biên nhận chứa UUID người mượn/Copy và snapshot response, không có tên/email/token; chưa có job dọn để tránh replay tạo lại nghiệp vụ. Dung lượng sẽ tăng theo số lệnh thành công. Trước pilot cần chốt thời hạn retention, cơ chế tombstone cho key hết hạn, quyền xuất/xóa và nghĩa vụ lưu trữ; không tự xóa dữ liệu production.

V18 không đổi migration V1–V17. `LoanSchemaTest` kiểm nâng V17 với Loan/receipt cũ, lifecycle/FK/unique của Hold; fresh schema được kiểm qua các Spring integration test. `HoldIntegrationTest` kiểm chọn Edition/Branch, FIFO, owner isolation, retry, rollback, deadline với Clock điều khiển, worker lặp, return/cancel và hai return đồng thời, renew/return cạnh tranh. Test hủy chờ Book dùng `pg_blocking_pids` để chứng minh khóa thực. Job được gọi trực tiếp trong test để kiểm hạn xác định, không chờ đồng hồ thật. Đây là kiểm thử backend, không thay cho E2E giao diện lưu thông.
