# ERD mục tiêu

## Mục đích

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

  USERS { uuid id PK; string member_code UK; string email_normalized UK; string password_hash; string status }
  ROLES { string code PK }
  USER_ROLES { uuid user_id FK; string role_code FK }
  REFRESH_TOKENS { uuid id PK; uuid user_id FK; uuid family_id; string token_hash UK; datetime expires_at; datetime revoked_at }
  BOOKS { uuid id PK; string title; string normalized_title; datetime created_at }
  EDITIONS { uuid id PK; uuid book_id FK; string isbn13; int publication_year; uuid publisher_id FK }
  BOOK_COPIES { uuid id PK; uuid edition_id FK; string barcode UK; string status; uuid shelf_id FK; bigint version }
  LOANS { uuid id PK; uuid copy_id FK; uuid reader_id FK; datetime borrowed_at; datetime due_at; datetime returned_at }
  HOLDS { uuid id PK; uuid reader_id FK; uuid book_id FK; string status; datetime expires_at }
  OUTBOX_EVENTS { uuid id PK; string event_type; json payload; datetime occurred_at; datetime published_at }
  MEDIA_ASSETS { uuid id PK; string source; string source_id; string source_url; string image_url; string thumbnail_url; string license; string attribution; boolean verified; datetime fetched_at }
```

## Quy tắc trọng yếu

Phase 1A đã triển khai `USERS`, `ROLES`, `USER_ROLES`, `REFRESH_TOKENS` bằng Flyway V2. `USERS.id` là UUID cho Member/Profile tham chiếu sau này; `member_code` do Identity tạo, duy nhất. Chưa có bảng MemberProfile.

- Book, Edition và Copy là ba aggregate/data concept khác nhau.
- Chỉ một loan chưa trả được tồn tại cho một copy; thực thi bằng constraint/index cùng transaction.
- Barcode là duy nhất. ISBN không được giả định luôn có hoặc luôn duy nhất toàn cầu nếu dữ liệu nguồn chưa xác minh.
- Copy state và active hold assignment quyết định availability; không dùng `books.available/total` làm nguồn thật.
- Các entity analytics nằm trong `lams_insight`; Core phát fact qua outbox/event thay vì cho Insight sửa schema Core.
