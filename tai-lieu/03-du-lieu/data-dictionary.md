# Data Dictionary

## Insight: dấu vết tra cứu ISBN

Prisma `MetadataLookup` ánh xạ `metadata_lookups`: UUID id/owner_id, isbn13 (13 chữ số), attempts JSONB chỉ provider/status, created_at timestamptz. Index owner/time/id và owner/ISBN. Không có FK xuyên database, không có title/ảnh/token/email. Xem [ORM](../02-kien-truc/metadata-history-orm.md). Đây không phải bản sao sách chính thức; replay lấy dữ liệu hiện tại.

Đây là dictionary logic; tên cột chi tiết được chốt qua migration của từng feature.

| Entity | Ý nghĩa | Thuộc tính/constraint quan trọng | Owner |
|---|---|---|---|
| User (`users`, V2) | Tài khoản reader/staff/admin | UUID `id`; `member_code` unique; `email_normalized` unique; `password_hash` BCrypt; `status` ACTIVE/LOCKED/DISABLED; timestamps | Core/Identity |
| Role (`roles`, V2) | Mã quyền | READER, LIBRARIAN, ADMIN; chỉ seed mã quyền | Core/Identity |
| UserRole (`user_roles`, V2) | Quyền của tài khoản | FK `users.id`, `roles.code`; registration chỉ cấp READER | Core/Identity |
| RefreshToken (`refresh_tokens`, V2) | Phiên làm mới | SHA-256 `token_hash` unique; `family_id`, expiry, revoke, replacement, remember; không lưu raw token | Core/Identity |
| Author (`authors`, V3) | Tác giả | UUID `id`; `name` bắt buộc, tối đa 200 ký tự; index theo tên; không áp đặt tên duy nhất; không xóa khi còn Book tham chiếu | Core/Catalog |
| Category (`categories`, V4) | Thể loại | UUID `id`; `name` hiển thị; `normalized_name` duy nhất sau chuẩn hóa Unicode NFKC, gộp khoảng trắng và không phân biệt hoa thường | Core/Catalog |
| CategoryAlias (`category_aliases`, V23) | Bí danh trỏ tới thể loại chuẩn | UUID `id`; FK `category_id` `ON DELETE RESTRICT`; `normalized_alias` duy nhất, service từ chối trùng khóa tên Category chuẩn; cần xử lý alias trước khi xóa Category | Core/Catalog |
| Publisher (`publishers`, V5) | Nhà xuất bản | UUID `id`; `name` bắt buộc, tối đa 200 ký tự; index theo tên; không áp đặt tên duy nhất | Core/Catalog |
| Book (`books`, V6/V22) | Tác phẩm logic | UUID `id`; title, normalized title, description; V22 thêm `search_title`, `search_description`, `search_vector` để tra cứu, cập nhật qua trigger; quan hệ nhiều-nhiều với Author/Category; không chứa barcode hoặc số lượng availability | Core/Catalog |
| CatalogExternalSource (`catalog_external_sources`, V25) | Định danh thư mục ngoài của Book | Khóa `(source_code, source_record_id)`; `book_id` FK RESTRICT; URL nguồn, SHA-256 ảnh chụp metadata, title/author gốc, ngày phát hành ebook nếu có và thời điểm nhập. Không chứa ISBN hoặc tồn kho suy đoán | Core/Catalog |
| Favorite (`favorites`, V14) | Liên kết sách yêu thích của user | FK `user_id`/`book_id`; unique ghép `(user_id, book_id)`; `created_at` UTC; xóa User hoặc Book sẽ cascade liên kết | Core/Reader contributions |
| Review (`reviews`, V15) | Review và rating công khai của user cho Book | UUID `id`; FK User/Book restrict; unique `(user_id, book_id)`; body đã trim 1–5000 ký tự; rating `SMALLINT` 1–5; `created_at`/`updated_at`; chưa có workflow moderation | Core/Reader contributions |
| Edition (`editions`, V7) | Ấn bản của Book | UUID `id`; Book FK bắt buộc; Publisher tùy chọn; ISBN-13 tùy chọn, chưa unique; năm và ngôn ngữ tùy chọn | Core/Catalog |
| Branch (`branches`, V8) | Chi nhánh thư viện | UUID `id`; `code` duy nhất; `name` bắt buộc; trạng thái ACTIVE/DISABLED | Core/Inventory |
| Shelf (`shelves`, V9) | Kệ thuộc chi nhánh | UUID `id`; Branch FK; mã duy nhất trong Branch; label; thứ tự; không xóa khi còn Copy tham chiếu | Core/Inventory |
| BookCopy (`book_copies`, V10) | Bản sách vật lý | UUID `id`; Edition/Shelf FK; barcode duy nhất; status; version; không để API bảo trì đổi trạng thái lưu thông | Core/Inventory |
| CatalogMediaReference (`catalog_media_references`, V12) | Ảnh đã được nhân viên duyệt | Một Edition hoặc Author FK; unique theo đối tượng; source/source ID/URL, license/attribution/evidence; MIME/bytes; approved_by FK users, approved_at, version | Core/Catalog |
| Loan (`loans`, V16) | Lần cho mượn một Copy; command mượn/trả ghi cùng Copy/audit/outbox | UUID id/copy/edition/reader/branch/borrowed_by/returned_by; borrowed/due/returned time; renewal_count, version; policy_version/snapshot JSONB; unique copy khi returned_at null, FK RESTRICT | Core/Circulation |
| Command receipt (`circulation_requests`, V17) | Chống lặp lệnh theo nhân viên và requestId | PK actor_id/request_id; command; request_payload/response_payload JSONB; created_at; chỉ lưu cùng transaction thành công, chưa có dọn retention | Core/Circulation |
| Copy state audit (`copy_state_changes`, V17) | Lịch sử chuyển trạng thái vật lý | copy_id; from/to_status; copy_version unique theo Copy; actor_id/actor_kind; reason; occurred_at; FK RESTRICT | Core/Inventory |
| Hold (`holds`, V18) | Yêu cầu giữ chỗ theo Book và chi nhánh | reader/book/branch FK; edition nullable nghĩa là bất kỳ ấn bản; queued/ready/expires/closed time; copy/loan FK; status, version, policy_version/pickup_seconds; unique active reader/book và READY/copy | Core/Hold |
| Hold change (`hold_changes`, V18) | Lịch sử chuyển trạng thái giữ chỗ | hold_id, hold_version unique theo Hold; event_type; actor_id null khi job hệ thống; occurred_at | Core/Hold |
| Loan extension (`loan_extensions`, V18) | Lịch sử gia hạn | loan_id/actor FK; unique loan/version; previous_due_at, due_at tăng, extended_at; policy_version/snapshot tại lúc gia hạn | Core/Circulation |
| InventorySession (`inventory_sessions`, V20) | Phiên kiểm kê có phạm vi | branch/shelf, người mở/chốt, OPEN/FINALIZED/CANCELLED, version, giới hạn 5.000 bản chụp và 20.000 scan; một phiên OPEN mỗi chi nhánh | Core/Inventory |
| InventorySnapshot (`inventory_snapshots`, V20) | Bản chụp Copy khi mở phiên | session/copy, barcode, branch/shelf, status, copy_version; không FK tới Copy sống để giữ bằng chứng | Core/Inventory |
| InventoryScan (`inventory_scans`, V20) | Lượt quét append-only | client_scan_id duy nhất trong phiên, barcode/kệ/người quét/thời điểm server; retry qua biên nhận giao dịch | Core/Inventory |
| InventoryAnomaly (`inventory_anomalies`, V20) | Bất thường đã chốt | sáu kind, evidence JSONB cố định, Copy có thể null, thời điểm phát hiện | Core/Inventory |
| InventoryResolution (`inventory_resolutions`, V21) | Quyết định rà soát của nhân viên | duy nhất theo anomaly; REVIEWED hoặc MOVE_TO_SCANNED_SHELF, reason, version Copy, actor và thời điểm | Core/Inventory |
| AcquisitionRecommendation (`acquisition_recommendations`, Insight Prisma) | Đề xuất bổ sung sách nội bộ | Book/branch UUID, cửa sổ và thời điểm snapshot, phiên bản nguồn/công thức, điểm/confidence, evidence JSONB; trạng thái DRAFT/APPROVED/REJECTED, version và thông tin người duyệt; unique snapshot/phạm vi/phiên bản | Insight/Acquisition |
| AcquisitionDecision (`acquisition_decisions`, Insight Prisma) | Lịch sử quyết định đề xuất | FK recommendation, action, actor, lý do, version; unique recommendation/version; không phải đơn đặt mua | Insight/Acquisition |
| SearchEvent (thiết kế, chưa có bảng) | Tín hiệu tìm kiếm dự kiến | Chưa ghi query, kết quả rỗng hoặc session hash; không được dùng làm dữ liệu báo cáo hiện tại | Insight/Analytics |
| DemandSignal (thiết kế, chưa có bảng) | Tín hiệu nhu cầu quy chuẩn dự kiến | source type, target book/query cluster, weight, window, evidence | Insight/Analytics |

V13 cấp version media bằng `catalog_media_revision_seq` cho mỗi lần tạo/thay ảnh, bắt đầu trên version lớn nhất khi nâng cấp. Không reset khi gỡ ảnh; request cũ không được áp dụng lên tham chiếu tạo lại. Sequence có thể có khoảng trống; không dùng làm số lượng ảnh hoặc số lần chỉnh sửa.

V14 tạo Favorites với unique `(user_id, book_id)` và cascade theo User/Book. V15 tạo Reviews, unique một review/user/book; xóa User/Book bị restrict khi còn review. Rating thuộc Review; average/count được tính từ các review hiện hành, không lưu aggregate riêng. Review công khai ngay, chưa có API hoặc trạng thái moderation.

## Các nhóm còn lại

V16 thêm `loans`; V17 thêm receipt/audit; V18 thêm Hold/audit/gia hạn, không backfill giao dịch hay đổi trạng thái Copy cũ. Chi tiết transaction, trạng thái dẫn xuất, FK, policy PROVISIONAL và retention xem [kiến trúc lưu thông](../02-kien-truc/circulation.md). V18 dùng composite FK Book/Edition để ngăn chọn ấn bản thuộc đầu sách khác; quan hệ Copy/Loan đúng với Hold vẫn do command kiểm trong transaction.

- Identity: `roles`, `user_roles`, `refresh_tokens`.
- Catalog: `authors`, `categories`, `publishers`, `books`, `book_authors`, `book_categories` và `editions` có migration V3–V7; V22 thêm chỉ mục tìm kiếm Book, không tạo bảng SearchEvent.
- Inventory: `branches`, `shelves`, `book_copies` có migration V8–V10; phiên/snapshot/scan/anomaly ở V20 và resolution ở V21. `copy_location_history` chuyên biệt chưa có; quyết định chuyển kệ từ kiểm kê được truy qua resolution và version Copy.
- Circulation/reader: lịch sử Hold dùng tên thực tế `hold_changes`, không tạo thêm `hold_events` trùng chức năng.
- Discovery: `search_documents` chưa có migration; tra cứu từ vựng dùng cột và chỉ mục trên `books`. Core có endpoint read facts cho Copy/Hold/Loan; Insight có migration lưu `acquisition_recommendations` và `acquisition_decisions`, adapter đọc Core và API nội bộ tạo/duyệt đề xuất. Web và EXE E2E đã đi qua hai dịch vụ trên PostgreSQL tạm và kiểm bản ghi quyết định thật.
- System dự kiến: `notifications`, `system_policies`, `audit_logs`, `media_assets` là tên trong mô hình mục tiêu, chưa phải bảng đang có. `outbox_events` được tạo từ V1 và bổ sung cơ chế giao nhận ở V19; thông báo người dùng hiện lưu trong bảng `circulation_notices` của Insight.

## Media asset

Phase 2 triển khai `catalog_media_references` cho **Edition hoặc Author**, không triển khai bảng `media_assets` tổng quát trong ERD mục tiêu. Check constraint yêu cầu đúng một FK; mỗi đối tượng tối đa một ảnh đã duyệt. Xóa đối tượng thì xóa tham chiếu ảnh, không tác động file nhà cung cấp. V11 chuẩn hóa lại khóa Category/Book cũ, giữ UUID/FK và từ chối collision trước khi ghi.

`source`, `source_id`, `source_url`, `image_url`, `thumbnail_url`, `license`, `attribution`, `verified`, `fetched_at` giữ provenance. Asset chưa xác minh không được gắn ảnh người ngẫu nhiên; ảnh tác giả thiếu dùng initials ở UI.
