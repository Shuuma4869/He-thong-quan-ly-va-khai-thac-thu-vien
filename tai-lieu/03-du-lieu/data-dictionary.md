# Data Dictionary

Đây là dictionary logic; tên cột chi tiết được chốt qua migration của từng feature.

| Entity | Ý nghĩa | Thuộc tính/constraint quan trọng | Owner |
|---|---|---|---|
| User (`users`, V2) | Tài khoản reader/staff/admin | UUID `id`; `member_code` unique; `email_normalized` unique; `password_hash` BCrypt; `status` ACTIVE/LOCKED/DISABLED; timestamps | Core/Identity |
| Role (`roles`, V2) | Mã quyền | READER, LIBRARIAN, ADMIN; chỉ seed mã quyền | Core/Identity |
| UserRole (`user_roles`, V2) | Quyền của tài khoản | FK `users.id`, `roles.code`; registration chỉ cấp READER | Core/Identity |
| RefreshToken (`refresh_tokens`, V2) | Phiên làm mới | SHA-256 `token_hash` unique; `family_id`, expiry, revoke, replacement, remember; không lưu raw token | Core/Identity |
| Author (`authors`, V3) | Tác giả | UUID `id`; `name` bắt buộc, tối đa 200 ký tự; index theo tên; không áp đặt tên duy nhất; không xóa khi còn Book tham chiếu | Core/Catalog |
| Category (`categories`, V4) | Thể loại | UUID `id`; `name` hiển thị; `normalized_name` duy nhất sau chuẩn hóa Unicode NFKC, gộp khoảng trắng và không phân biệt hoa thường | Core/Catalog |
| Publisher (`publishers`, V5) | Nhà xuất bản | UUID `id`; `name` bắt buộc, tối đa 200 ký tự; index theo tên; không áp đặt tên duy nhất | Core/Catalog |
| Book (`books`, V6) | Tác phẩm logic | UUID `id`; title và normalized title; description tùy chọn; quan hệ nhiều-nhiều với Author/Category; không chứa barcode hoặc số lượng availability | Core/Catalog |
| Edition (`editions`, V7) | Ấn bản của Book | UUID `id`; Book FK bắt buộc; Publisher tùy chọn; ISBN-13 tùy chọn, chưa unique; năm và ngôn ngữ tùy chọn | Core/Catalog |
| Branch (`branches`, V8) | Chi nhánh thư viện | UUID `id`; `code` duy nhất; `name` bắt buộc; trạng thái ACTIVE/DISABLED | Core/Inventory |
| Shelf (`shelves`, V9) | Kệ thuộc chi nhánh | UUID `id`; Branch FK; mã duy nhất trong Branch; label; thứ tự; không xóa khi còn Copy tham chiếu | Core/Inventory |
| BookCopy (`book_copies`, V10) | Bản sách vật lý | UUID `id`; Edition/Shelf FK; barcode duy nhất; status; version; không để API bảo trì đổi trạng thái lưu thông | Core/Inventory |
| CatalogMediaReference (`catalog_media_references`, V12) | Ảnh đã được nhân viên duyệt | Một Edition hoặc Author FK; unique theo đối tượng; source/source ID/URL, license/attribution/evidence; MIME/bytes; approved_by FK users, approved_at, version | Core/Catalog |
| Loan | Lần cho mượn một Copy | reader, borrowed/due/returned time; tối đa một active loan/copy | Core/Circulation |
| Hold | Vị trí chờ tài liệu | reader, book/edition preference, queue time, state, assigned copy, pickup TTL | Core/Hold |
| InventorySession | Phiên kiểm kê có phạm vi | branch/shelf scope, started/finished by, status, snapshot boundary | Core/Inventory |
| SearchEvent | Một truy vấn đã ẩn danh/giảm PII | query normalized, filters, result count, session hash, time | Insight/Analytics |
| DemandSignal | Tín hiệu nhu cầu quy chuẩn | source type, target book/query cluster, weight, window, evidence | Insight/Analytics |

V13 cấp version media bằng `catalog_media_revision_seq` cho mỗi lần tạo/thay ảnh, bắt đầu trên version lớn nhất khi nâng cấp. Không reset khi gỡ ảnh; request cũ không được áp dụng lên tham chiếu tạo lại. Sequence có thể có khoảng trống; không dùng làm số lượng ảnh hoặc số lần chỉnh sửa.

## Các nhóm còn lại

- Identity: `roles`, `user_roles`, `refresh_tokens`.
- Catalog: `authors`, `categories`, `publishers`, `books`, `book_authors`, `book_categories` và `editions` có migration V3–V7.
- Inventory: `branches`, `shelves`, `book_copies` có migration V8–V10; `copy_location_history`, `inventory_scans`, `inventory_anomalies` còn chờ triển khai.
- Circulation/reader: `loan_extensions`, `hold_events`, `favorites`, `reviews`.
- Discovery: `search_documents`, `acquisition_recommendations`.
- System: `notifications`, `system_policies`, `audit_logs`, `outbox_events`, `media_assets`.

## Media asset

Phase 2 triển khai `catalog_media_references` cho **Edition hoặc Author**, không triển khai bảng `media_assets` tổng quát trong ERD mục tiêu. Check constraint yêu cầu đúng một FK; mỗi đối tượng tối đa một ảnh đã duyệt. Xóa đối tượng thì xóa tham chiếu ảnh, không tác động file nhà cung cấp. V11 chuẩn hóa lại khóa Category/Book cũ, giữ UUID/FK và từ chối collision trước khi ghi.

`source`, `source_id`, `source_url`, `image_url`, `thumbnail_url`, `license`, `attribution`, `verified`, `fetched_at` giữ provenance. Asset chưa xác minh không được gắn ảnh người ngẫu nhiên; ảnh tác giả thiếu dùng initials ở UI.
