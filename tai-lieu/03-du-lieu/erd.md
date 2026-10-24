# ERD mục tiêu

## Insight history đã có schema

```mermaid
erDiagram
  METADATA_LOOKUPS {
    uuid id PK
    uuid owner_id "Core principal; không FK xuyên database"
    varchar isbn13
    jsonb attempts "provider/status, không payload"
    timestamptz created_at
  }
```

Database Insight sở hữu lịch sử tra cứu; không nối Book bằng FK và không sao chép Catalog. Schema đã viết không tự chứng minh migration runtime đã được nghiệm thu.

## Core đã có migration

```mermaid
erDiagram
  USERS ||--o{ USER_ROLES : has
  ROLES ||--o{ USER_ROLES : grants
  USERS ||--o{ REFRESH_TOKENS : owns
```

Catalog/Inventory và ảnh tham chiếu:

```mermaid
erDiagram
  AUTHORS ||--o{ BOOK_AUTHORS : writes
  BOOKS ||--o{ BOOK_AUTHORS : credited
  CATEGORIES ||--o{ BOOK_CATEGORIES : groups
  BOOKS ||--o{ BOOK_CATEGORIES : classified
  BOOKS ||--o{ EDITIONS : has
  PUBLISHERS |o--o{ EDITIONS : optional_publisher
  EDITIONS ||--o{ BOOK_COPIES : manifests
  BRANCHES ||--o{ SHELVES : contains
  SHELVES ||--o{ BOOK_COPIES : locates
  AUTHORS |o--o| CATALOG_MEDIA_REFERENCES : exclusive_author
  EDITIONS |o--o| CATALOG_MEDIA_REFERENCES : exclusive_edition
```

My Library: Core API và UI Phase 3:

```mermaid
erDiagram
  USERS ||--o{ FAVORITES : saves
  BOOKS ||--o{ FAVORITES : saved
  USERS ||--o{ REVIEWS : writes
  BOOKS ||--o{ REVIEWS : reviewed
```

Media reference có đúng một trong hai FK Author/Edition, không phải cả hai cùng lúc; V13 bổ sung revision. Favorites/Reviews đã có schema, backend và UI Phase 3; trạng thái kiểm thử và tích hợp xem [bàn giao](../00-bat-dau/handoff-phase3-4.md). Chi tiết cột và constraint xem data dictionary và migration, không suy từ sơ đồ roadmap bên dưới.

## Mục đích sơ đồ mục tiêu

V16 bổ sung Loan trong Core; V17 thêm receipt và audit phục vụ Borrow/Return (Renew/Hold chưa có):

```mermaid
erDiagram
  USERS ||--o{ LOANS : reader_and_staff
  BOOK_COPIES ||--o{ LOANS : physical_copy
  EDITIONS ||--o{ LOANS : edition_at_borrow
  BRANCHES ||--o{ LOANS : branch_at_borrow
```

V17: `users 1—n circulation_requests`, khóa chính `(actor_id, request_id)`; `book_copies 1—n copy_state_changes`, unique `(copy_id, copy_version)`. Audit tham chiếu actor là users khi HUMAN, không có actor khi SYSTEM. Chưa có thao tác SYSTEM ở mốc mượn/trả này.

FK RESTRICT giữ lịch sử; unique partial `copy_id WHERE returned_at IS NULL` chặn hai Loan đang mở. [Kiến trúc lưu thông](../02-kien-truc/circulation.md) ghi transaction và giới hạn schema/policy/retention; chưa có Hold hoặc giao diện lưu thông chỉ từ sơ đồ này.

Mô tả target model để thống nhất tên và ownership. Đây không phải khẳng định mọi bảng đã được migration trong Giai đoạn 01.

```mermaid
erDiagram
  USERS ||--o{ USER_ROLES : has
  ROLES ||--o{ USER_ROLES : grants
  USERS ||--o{ REFRESH_TOKENS : owns
  BOOKS ||--o{ EDITIONS : has
  BOOKS ||--o{ BOOK_AUTHORS : credited
  AUTHORS ||--o{ BOOK_AUTHORS : writes
  PUBLISHERS ||--o{ EDITIONS : publishes
  BOOKS ||--o{ BOOK_CATEGORIES : classified
  CATEGORIES ||--o{ BOOK_CATEGORIES : groups
  EDITIONS ||--o{ BOOK_COPIES : manifests
  BRANCHES ||--o{ SHELVES : contains
  SHELVES ||--o{ BOOK_COPIES : locates
  BOOK_COPIES ||--o{ COPY_LOCATION_HISTORY : moves
  USERS ||--o{ LOANS : borrows
  BOOK_COPIES ||--o{ LOANS : loaned
  LOANS ||--o{ LOAN_EXTENSIONS : extended
  USERS ||--o{ HOLDS : requests
  BOOKS ||--o{ HOLDS : targets
  HOLDS ||--o{ HOLD_EVENTS : transitions
  USERS ||--o{ FAVORITES : saves
  BOOKS ||--o{ FAVORITES : saved
  USERS ||--o{ REVIEWS : writes
  BOOKS ||--o{ REVIEWS : reviewed
  BRANCHES ||--o{ INVENTORY_SESSIONS : audits
  INVENTORY_SESSIONS ||--o{ INVENTORY_SCANS : records
  BOOK_COPIES ||--o{ INVENTORY_SCANS : scanned
  INVENTORY_SESSIONS ||--o{ INVENTORY_ANOMALIES : finds
  SEARCH_EVENTS ||--o{ DEMAND_SIGNALS : contributes
  BOOKS ||--o{ SEARCH_DOCUMENTS : indexed
  BOOKS ||--o{ DEMAND_SIGNALS : concerns
  DEMAND_SIGNALS ||--o{ ACQUISITION_RECOMMENDATIONS : explains
  USERS ||--o{ NOTIFICATIONS : receives
  MEDIA_ASSETS }o--|| BOOKS : may_attach

  USERS {
    uuid id PK
    string member_code UK
    string email_normalized UK
    string password_hash
    string status
  }
  ROLES {
    string code PK
  }
  USER_ROLES {
    uuid user_id FK
    string role_code FK
  }
  REFRESH_TOKENS {
    uuid id PK
    uuid user_id FK
    uuid family_id
    string token_hash UK
    datetime expires_at
    datetime revoked_at
  }
  BOOKS {
    uuid id PK
    string title
    string normalized_title
    datetime created_at
  }
  FAVORITES {
    uuid user_id FK
    uuid book_id FK
    datetime created_at
  }
  REVIEWS {
    uuid id PK
    uuid user_id FK
    uuid book_id FK
    text body
    int rating
    datetime created_at
    datetime updated_at
  }
  EDITIONS {
    uuid id PK
    uuid book_id FK
    string isbn13
    int publication_year
    uuid publisher_id FK
  }
  BOOK_COPIES {
    uuid id PK
    uuid edition_id FK
    string barcode UK
    string status
    uuid shelf_id FK
    bigint version
  }
  LOANS {
    uuid id PK
    uuid copy_id FK
    uuid reader_id FK
    datetime borrowed_at
    datetime due_at
    datetime returned_at
  }
  HOLDS {
    uuid id PK
    uuid reader_id FK
    uuid book_id FK
    string status
    datetime expires_at
  }
  OUTBOX_EVENTS {
    uuid id PK
    string event_type
    json payload
    datetime occurred_at
    datetime published_at
  }
  MEDIA_ASSETS {
    uuid id PK
    string source
    string source_id
    string source_url
    string image_url
    string thumbnail_url
    string license
    string attribution
    boolean verified
    datetime fetched_at
  }
```

## Quy tắc trọng yếu

Catalog/Inventory hiện có V3–V10; V11 nâng cấp khóa chuẩn hóa; V12 triển khai `catalog_media_references` với Edition hoặc Author (exclusive FK), không phải quan hệ MEDIA_ASSETS–BOOKS trong sơ đồ mục tiêu. V14 triển khai Favorites; V15 triển khai Reviews và rating 1–5. Các entity roadmap còn lại trong sơ đồ không đồng nghĩa đã có migration.

Phase 1A đã triển khai `USERS`, `ROLES`, `USER_ROLES`, `REFRESH_TOKENS` bằng Flyway V2. `USERS.id` là UUID cho Member/Profile tham chiếu sau này; `member_code` do Identity tạo, duy nhất. Chưa có bảng MemberProfile.

- Book, Edition và Copy là ba aggregate/data concept khác nhau.
- Chỉ một loan chưa trả được tồn tại cho một copy; thực thi bằng constraint/index cùng transaction.
- Barcode là duy nhất. ISBN không được giả định luôn có hoặc luôn duy nhất toàn cầu nếu dữ liệu nguồn chưa xác minh.
- Copy state và active hold assignment quyết định availability; không dùng `books.available/total` làm nguồn thật.
- Favorites unique theo `(user_id, book_id)`, cascade khi User/Book bị xóa. Reviews unique theo cặp này, restrict xóa User/Book; review hiện công khai ngay, chưa có moderation workflow. Rating nằm trên review; average/count là projection tính từ reviews hiện hành, không phải nguồn dữ liệu riêng.
- Các entity analytics nằm trong `lams_insight`; Core phát fact qua outbox/event thay vì cho Insight sửa schema Core.
