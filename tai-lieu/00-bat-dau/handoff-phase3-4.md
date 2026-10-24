# Bàn giao Phase 3 và điều kiện bắt đầu Phase 4

## Điều kiện chung

Phase 2.5 đã tích hợp qua PR #12 tại `b9cf5f3898e92c0b1420c9d031275e8066f1ba20`; CI main `39985051027` đạt năm job. Nhánh DEV1 là `Tuan/core-platform`, PR trực tiếp vào main, giữ nguyên `Toan/common-modules`. Trước mỗi lần tích hợp phải kiểm lại GitHub; SHA trong tài liệu là mốc truy vết, không thay trạng thái hiện tại.

## Phase 3 — Toan

PR #11, head f4dcbcb4597a0151e8f55611d627e92be045ddc8, merge b8e7bc616d72b608acdb91a43965484e39dfa6ce. Backend P3-D2-01 Favorites, P3-D2-02 Reviews, P3-D2-03 Rating do Toan triển khai. DEV1 review và sửa tích hợp trên nhánh của mình, không sửa lịch sử hoặc nhánh Toan.

- Contract: Core OpenAPI favorites/reviews/rating; V14 favorites, V15 reviews; unique user-book; rating 1–5; favorites cascade, reviews restrict.
- Tests hiện có: FavoriteIntegrationTest, ReviewIntegrationTest, ReviewConcurrencyTest, Phase3MigrationTest, Catalog regression.
- Chạy lại Maven clean verify trên SHA bàn giao với PostgreSQL, fresh và upgrade V13.
- Câu hỏi review: hai PATCH đồng thời sửa body/rating có mất cập nhật? Patch null/empty thế nào? Xóa review cuối aggregate null/count 0 có nhất quán? Role bị revoke/LOCKED có chặn mọi mutation? Query/tie-break và DTO có rò userId? Cạnh tranh Book delete/create trả lỗi gì?
- Đã tái hiện trên PostgreSQL và sửa: hai PATCH khác field ghi đè nhau, null tường minh không đúng contract và lỗi FK khi Book bị xóa trong lúc INSERT. Test phối hợp hai transaction, không dùng sleep ngẫu nhiên. UPDATE chỉ sửa field được gửi; cùng field theo lần ghi database sau thắng. Xem [cơ chế và giới hạn](../02-kien-truc/favorites-reviews.md).
- Staff không có quyền moderation ngầm. DEV1 bổ sung GET `/me/favorites/{bookId}` và GET `/me/reviews` cho UI; không thêm migration, không chuyển dữ liệu sang Insight.

## Phase 3 — Tuan

PR #13 đã merge tại `ea93b7ae301389aae983314db56dea9fdb27869c` ngày 24/10/2026 (Asia/Saigon). Head trước merge `6598dd3` đạt CI 5/5 tại run `40010074211`; [minh chứng desktop](../../ho-so-nop-bai/minh-chung-giao-dien/README.md) phân biệt checkout, binary và ảnh. Nhánh Tuan đã fast-forward tới commit merge; nhánh Toan không thay đổi. CI main `40011636146` đạt đủ năm job, đóng Integration Gate Phase 3.

P3-D1-01 Favorites UI phụ thuộc D2-01; D1-02 ReviewSection trong BookDetail phụ thuộc D2-02; D1-03 RatingInput phụ thuộc D1-02/D2-03; D1-04 MyLibrary/Profile integration sau Favorites/Reviews.

| Task | File thực thi | Đầu ra |
|---|---|---|
| P3-D1-01 | features/favorites/FavoriteButton.tsx; features/my-library/MyLibraryPage.tsx | Lưu/bỏ yêu thích ở BookDetail và danh sách cá nhân; không có FavoritesPage riêng |
| P3-D1-02 | features/reviews/ReviewSection.tsx | Tạo/sửa/xóa, phân trang, xác nhận xóa, lỗi giữ input; chỉ PATCH field đổi |
| P3-D1-03 | features/reviews/RatingInput.tsx | Radio 1–5 dùng bàn phím, summary từ Core; rating nằm trong review |
| P3-D1-04 | features/my-library/MyLibraryPage.tsx; ProfilePage; ReaderLayout; AppRouter | `/thu-vien-cua-toi`, hai danh sách độc lập, cache và remount theo user |

Đường dẫn frontend tính từ `frontend/src`. Shared client kiểm session generation; logout xóa cache. Không optimistic mutation, chỉ báo thành công sau response server. Timeout sau commit cần tải lại, không tự gửi POST lặp. LibraryFlow và library-api kiểm component/client; E2E Phase 3 kiểm persistence, reload, đổi tài khoản và 403 cross-owner với API/PostgreSQL thật.

Implementation chưa tự động có nghĩa TESTED hoặc INTEGRATED. Gate cần Core clean verify, Insight/Prisma, frontend typecheck/lint/test/build, OpenAPI, web E2E, Rust/Tauri, EXE mới build và CI năm job đúng SHA. Không dùng ảnh/binary `ee929cd` thay bằng chứng Phase 3. Kết quả chạy và merge của bản bàn giao xem PR/CI; Academic Final Gate vẫn cần xác nhận học phần bên ngoài repository.

## Phase 4 — Tuan

V16 `loans` và policy đã tích hợp qua PR #14, merge `bc5151039efd4826e9eb03dc52ac1f991999e5c7`; CI main `40041476883` đạt 5/5. V17 trên nhánh Tuan bổ sung receipt/audit, khóa và command mượn/trả. V1–V16 giữ nguyên. P4-D1-02 dùng giá trị phát triển PROVISIONAL; chưa coi toàn bộ Phase 4 hoàn thành từ mốc command này.

| Task | Output hiện có hoặc đang chờ | Kiểm chứng / điều kiện nối tiếp |
|---|---|---|
| P4-D1-01 | V16, `Loan`, `LoanRepository` | `LoanSchemaTest`, `LoanRepositoryIntegrationTest`; unique active Copy, FK, upgrade V15, transaction |
| P4-D1-02 | `CirculationPolicy`, `BorrowPolicyService`; cấu hình môi trường | `BorrowPolicyTest`; quota/status/role/overdue, cấu hình sai dừng khởi động; command phải khóa Reader trước khi đếm |
| P4-D1-03/04/06/07/08 | Borrow/Return, CopyLockRepository/CopyStateService, receipt V17, audit/outbox | LoanCommandIntegrationTest kiểm quyền, replay, rollback, quota/copy race; Return cần nối phân bổ Hold ở bước sau |
| P4-D1-05 | Renew chưa có | Phụ thuộc Hold để chặn gia hạn khi có người đợi; cần lịch sử gia hạn |
| P4-D1-09..13 | Hold model/queue/allocation/expiry/ETA chưa có | FIFO, assignment unique, pickup TTL, concurrent cancel/expiry; ETA phải nêu độ bất định |
| P4-D1-14..15 | Outbox publisher và consumer thông báo chưa có | Cùng transaction Core, Kafka thật, retry/dedup/out-of-order/DLQ; không coi bảng outbox V1 là pipeline |
| P4-D1-16..17 | Reader/Staff circulation UI chưa có | Command thật và query P4-D2-01 của Toan; thiếu dependency phải hiện rõ, không tạo dữ liệu giả |

Chi tiết schema, cấu hình, retention và ranh giới kiểm thử ở [kiến trúc lưu thông](../02-kien-truc/circulation.md). Tất cả đường dẫn Java trong bảng tính từ package Core. Bảng này không đánh dấu cả Phase 4 hoàn thành.

Phân công gốc vẫn giữ để truy vết tác giả. Quyết định ngày 24/10/2026 mở rộng triển khai trên nhánh Tuan tới phần còn thiếu của cả hai thành viên trong Phase 4–6, gồm P4-D2-01..05 (query/filter/report/CSV/tests). Không sửa nhánh Toan, không gán code gốc của Toan cho Tuan, không đánh dấu các task mới DONE trước khi có đầu ra và kiểm chứng.

Điều kiện bắt đầu: Phase 3 contract/tests/main gate đã đạt, DEV1 duyệt policy quota/due date/renew/hold priority, migration number được đăng ký. Bảo toàn Book != Edition != Copy; transaction nghiệp vụ ở Core; unique một active loan/copy; không fake availability; event chỉ publish qua outbox sau khi thực sự triển khai. Không cho Insight viết bảng Core. Concurrency cần PostgreSQL tests phối hợp transaction, không chỉ sleep.

Policy cấu hình dùng mặc định PROVISIONAL phải ghi rõ; quyết định làm đổi nghiệp vụ hoặc quyền không thể đảo ngược cần xác nhận. UI lưu thông sẽ nối query thật sau command, không tạo API giả hoặc dữ liệu Loan/Hold mẫu trong production. Phase 5 đã chốt sáu loại bất thường: WRONG_SHELF, EXPECTED_BUT_MISSING, STATUS_MISMATCH, WRONG_BRANCH, UNKNOWN_BARCODE, DUPLICATE_SCAN; sửa dữ liệu phải có nhân viên xác nhận và kiểm version. Quyết định này không phải bằng chứng đã triển khai kiểm kê.
