# Data Dictionary

Đây là dictionary logic; tên cột chi tiết được chốt qua migration của từng feature.

| Entity | Ý nghĩa | Thuộc tính/constraint quan trọng | Owner |
|---|---|---|---|
| User (`users`, V2) | Tài khoản reader/staff/admin | UUID `id`; `member_code` unique; `email_normalized` unique; `password_hash` BCrypt; `status` ACTIVE/LOCKED/DISABLED; timestamps | Core/Identity |
| Role (`roles`, V2) | Mã quyền | READER, LIBRARIAN, ADMIN; chỉ seed mã quyền | Core/Identity |
| UserRole (`user_roles`, V2) | Quyền của tài khoản | FK `users.id`, `roles.code`; registration chỉ cấp READER | Core/Identity |
| RefreshToken (`refresh_tokens`, V2) | Phiên làm mới | SHA-256 `token_hash` unique; `family_id`, expiry, revoke, replacement, remember; không lưu raw token | Core/Identity |
| Book | Tác phẩm logic | title chuẩn hóa; description; không chứa số lượng availability | Core/Catalog |
| Edition | Ấn bản của Book | ISBN, publisher, publication year, language; Book FK bắt buộc | Core/Catalog |
| Copy | Bản vật lý | barcode unique; edition; branch/shelf; state; optimistic version | Core/Inventory |
| Loan | Lần cho mượn một Copy | reader, borrowed/due/returned time; tối đa một active loan/copy | Core/Circulation |
| Hold | Vị trí chờ tài liệu | reader, book/edition preference, queue time, state, assigned copy, pickup TTL | Core/Hold |
| Shelf | Vị trí vật lý trong Branch | code unique trong branch; label; thứ tự kiểm kê | Core/Inventory |
| InventorySession | Phiên kiểm kê có phạm vi | branch/shelf scope, started/finished by, status, snapshot boundary | Core/Inventory |
| SearchEvent | Một truy vấn đã ẩn danh/giảm PII | query normalized, filters, result count, session hash, time | Insight/Analytics |
| DemandSignal | Tín hiệu nhu cầu quy chuẩn | source type, target book/query cluster, weight, window, evidence | Insight/Analytics |

## Các nhóm còn lại

- Identity: `roles`, `user_roles`, `refresh_tokens`.
- Catalog: `authors`, `book_authors`, `publishers`, `categories`, `book_categories`.
- Inventory: `branches`, `copy_location_history`, `inventory_scans`, `inventory_anomalies`.
- Circulation/reader: `loan_extensions`, `hold_events`, `favorites`, `reviews`.
- Discovery: `search_documents`, `acquisition_recommendations`.
- System: `notifications`, `system_policies`, `audit_logs`, `outbox_events`, `media_assets`.

## Media asset

`source`, `source_id`, `source_url`, `image_url`, `thumbnail_url`, `license`, `attribution`, `verified`, `fetched_at` giữ provenance. Asset chưa xác minh không được gắn ảnh người ngẫu nhiên; ảnh tác giả thiếu dùng initials ở UI.
