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

Tuan giữ 17 task DEV1: Loan/schema/policy → borrow/return/renew → locking/idempotency → Hold/queue/allocation/expiry/ETA → outbox/Kafka/notification → Reader/Staff UI. Toan giữ P4-D2-01 đến P4-D2-05: query lịch sử, lọc, báo cáo, CSV và kiểm thử query. Không làm thay hoặc đánh dấu DONE phần Toan chưa bàn giao.

Điều kiện bắt đầu: Phase 3 contract/tests/main gate đã đạt, DEV1 duyệt policy quota/due date/renew/hold priority, migration number được đăng ký. Bảo toàn Book != Edition != Copy; transaction nghiệp vụ ở Core; unique một active loan/copy; không fake availability; event chỉ publish qua outbox sau khi thực sự triển khai. Không cho Insight viết bảng Core. Concurrency cần PostgreSQL tests phối hợp transaction, không chỉ sleep.

Policy cấu hình dùng mặc định PROVISIONAL phải ghi rõ; quyết định làm đổi nghiệp vụ hoặc quyền không thể đảo ngược cần xác nhận. Nếu UI thiếu query của Toan, ghi dependency và kiểm component độc lập, không tạo API giả hoặc dữ liệu Loan/Hold mẫu trong production. Loan/Hold chưa triển khai ở mốc bàn giao Phase 3 này.
