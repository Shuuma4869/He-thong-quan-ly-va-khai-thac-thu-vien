# Bàn giao từ Phase 2.5 sang Phase 3/4

## Điều kiện chung

Không tự triển khai Phase 3/4 khi Phase 2.5 chưa được review. Nhánh làm việc DEV1 là Tuan/core-platform, PR vào main; không merge nhánh Toan vào nhánh Tuan để tránh review. Main baseline b8e7bc6 chứa PR #11; khi bắt đầu phải xác minh SHA/CI mới nhất, không dùng snapshot này thay GitHub.

## Phase 3 — Toan

PR #11, head f4dcbcb4597a0151e8f55611d627e92be045ddc8, merge b8e7bc616d72b608acdb91a43965484e39dfa6ce. Backend P3-D2-01 Favorites, P3-D2-02 Reviews, P3-D2-03 Rating đã merge, chưa tuyên bố nghiệm thu chuyên sâu cuối.

- Contract: Core OpenAPI favorites/reviews/rating; V14 favorites, V15 reviews; unique user-book; rating 1–5; favorites cascade, reviews restrict.
- Tests hiện có: FavoriteIntegrationTest, ReviewIntegrationTest, Phase3MigrationTest, Catalog regression.
- Chạy lại Maven clean verify trên SHA bàn giao với PostgreSQL, fresh và upgrade V13.
- Câu hỏi review: hai PATCH đồng thời sửa body/rating có mất cập nhật? Patch null/empty thế nào? Xóa review cuối aggregate null/count 0 có nhất quán? Role bị revoke/LOCKED có chặn mọi mutation? Query/tie-break và DTO có rò userId? Cạnh tranh Book delete/create trả lỗi gì?
- Finding: ReviewService.update đọc toàn bản rồi ReviewRepository.update ghi cả body/rating, chưa có version/khóa đọc. Hai request đọc cùng bản cũ có thể ghi đè field request còn lại. Chưa tái hiện runtime trong lượt Phase 2.5; không gắn PASS.
- DEV1 cần chốt semantics cập nhật cạnh tranh và moderation; không tự trao staff quyền xóa review của người khác.

## Phase 3 — Tuan

P3-D1-01 Favorites UI phụ thuộc D2-01; D1-02 ReviewSection trong BookDetail phụ thuộc D2-02; D1-03 RatingInput phụ thuộc D1-02/D2-03; D1-04 MyLibrary/Profile integration sau Favorites/Reviews.

Giữ shared client/session và React Query theo user. Tái sử dụng error/loading, React-Bootstrap scoped và kỹ thuật test của history, không dùng HistoryRepository cho Favorites. Các route/component trong task map là tên dự kiến, phải đọc source trước khi tạo. Test owner/401/403/409/422, empty/pending/retry/reload, account switch, keyboard 1–5, aggregate sau mutation. Không đánh dấu DONE chỉ vì backend đã merge.

## Phase 4 — Tuan

Theo task map: chốt Loan schema/active-copy constraint → policy và command borrow → return/renew → locking/idempotency → Hold/outbox/assignment và UI theo dependency cụ thể. Toan giữ query/lịch sử/báo cáo được giao, không nhận command-side.

Điều kiện bắt đầu: Phase 3 contract/tests/main gate đã đạt, DEV1 duyệt policy quota/due date/renew/hold priority, migration number được đăng ký. Bảo toàn Book != Edition != Copy; transaction nghiệp vụ ở Core; unique một active loan/copy; không fake availability; event chỉ publish qua outbox sau khi thực sự triển khai. Không cho Insight viết bảng Core. Concurrency cần PostgreSQL tests phối hợp transaction, không chỉ sleep.

Phase 2.5 chỉ bàn giao danh sách này; chưa viết UI Favorites/Reviews/Rating, Loan hoặc Hold.
