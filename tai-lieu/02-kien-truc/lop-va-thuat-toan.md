# Lớp và thuật toán đang triển khai

Các sơ đồ tách Core khỏi Insight; quan hệ dependency không phải FK xuyên database. Java domain hiện là record, JDBC repository không phải entity JPA. DTO và Prisma persistence model không được đánh đồng.

## Core Identity/Catalog

```mermaid
classDiagram
  AuthController --> AuthService : DTO / transport
  AuthService --> IdentityRepository : JDBC
  IdentityRepository --> IdentityUser : maps
  AuthService --> UserView : returns
  class AuthService {
    +register(fullName,email,password) Session
    +login(identifier,password,remember) Session
    +refresh(rawToken) Session
    +logout(rawToken)
    +currentUser(id) UserView
  }
  BookController --> BookService
  BookService --> BookRepository
  BookRepository --> Book : maps record
  Book "1" <-- "0..*" Edition : bookId
  Edition "1" <-- "0..*" BookCopy : editionId
  class BookRepository {
    +list(page,size,query,authorId,categoryId) BookPage
    +create(book,normalizedTitle) Book
    +update(book,normalizedTitle) boolean
    +delete(id) boolean
  }
```

## Insight ISBN history

```mermaid
classDiagram
  HistoryController --> MetadataGuard : current Core principal
  HistoryController --> HistoryService
  HistoryController --> LookupRequest : input DTO
  HistoryController --> HistoryQuery : query DTO
  HistoryService --> MetadataService : current provider lookup
  HistoryService --> HistoryRepository
  HistoryRepository --> PrismaService
  PrismaService --> MetadataLookup : persistence model
  class HistoryService {
    +lookup(ownerId,isbn13)
    +list(ownerId,query)
    +get(ownerId,id)
    +replay(ownerId,id)
    +remove(ownerId,id)
  }
  class MetadataLookup {
    +UUID id
    +UUID ownerId
    +String isbn13
    +Json attempts
    +DateTime createdAt
  }
  class PrismaService {
    +onModuleInit()
    +onModuleDestroy()
  }
```

Một actor Core có 0..n MetadataLookup theo ownerId; đây là tham chiếu định danh, không sao chép User vào Insight. Chi tiết connection/transaction ở [ORM](metadata-history-orm.md).

## Đăng nhập, refresh và authorization

```mermaid
flowchart TD
  A[Nhận request] --> B{Login hay refresh?}
  B -->|Login| C[Validate định danh và mật khẩu]
  C --> D{Hash đúng và ACTIVE?}
  D -->|Không| E[401]
  D -->|Có| F[Tạo access JWT và refresh hash trong transaction]
  B -->|Refresh| G[Hash token; khóa dòng refresh]
  G --> H{Đã revoke?}
  H -->|Có| I[Revoke family; COMMIT; trả 401]
  H -->|Không| J{Còn hạn và user ACTIVE?}
  J -->|Không| E
  J -->|Có| K[Rotate token; COMMIT]
  F --> L[Response; cookie HttpOnly]
  K --> L
  L --> M[Request nghiệp vụ dùng Bearer]
  M --> N{JWT và quyền hiện tại hợp lệ?}
  N -->|Không| O[401 hoặc 403]
  N -->|Có| P[Thực hiện nghiệp vụ]
```

## Catalog filtering và cập nhật

```mermaid
flowchart TD
  A[Query hoặc mutation] --> B[Kiểm principal và quyền]
  B --> C{Input hợp lệ?}
  C -->|Không| D[422 hoặc lỗi boundary theo contract]
  C -->|Có query| E[Chuẩn hóa text; bind query và filter]
  E --> F[Đọc count và page nhất quán]
  F --> G[Trả page hoặc empty]
  C -->|Có mutation| H[BEGIN; kiểm FK/unique/version]
  H --> I{Invariant và version đúng?}
  I -->|Không| J[ROLLBACK; 404/409/422]
  I -->|Có| K[Write; COMMIT; trả DTO]
```

Shelf/Copy có thứ tự khóa trong service và regression PostgreSQL; không suy cơ chế đó tự áp dụng cho Review.

## Metadata/history

```mermaid
flowchart TD
  A[Staff gửi ISBN] --> B[Guard xác minh Core auth/me]
  B --> C{Role và rate limit hợp lệ?}
  C -->|Không| D[401/403/429/503]
  C -->|Có| E[DTO và ISBN checksum]
  E --> F{Hợp lệ?}
  F -->|Không| G[400; không write]
  F -->|Có| H[Provider bounded HTTP; ngoài DB transaction]
  H --> I[Candidate hoặc trạng thái unavailable/not-found]
  I --> J[Prisma create dấu vết]
  J --> K{Write thành công?}
  K -->|Không| L[503; không báo đã lưu]
  K -->|Có| M[201 record và kết quả hiện tại]
  N[GET list] --> O[Owner WHERE; count/items RepeatableRead]
  O --> P[Page DTO không ownerId]
  Q[GET/DELETE/replay id] --> R{ID thuộc owner?}
  R -->|Không| S[404]
  R -->|Có| T[Đọc hoặc xóa; replay gọi provider lại]
```

Các lưu đồ này mô tả implementation; không thay thế bằng chứng runtime. Mượn/trả/outbox vẫn planned.
