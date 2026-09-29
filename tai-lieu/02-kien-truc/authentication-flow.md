# Authentication Flow — Phase 1A

## Mục đích

Identity nằm trong Spring Core và `lams_core`. Đăng ký chỉ cấp `READER`. Access JWT sống 15 phút trong memory của frontend; opaque refresh token chỉ đi qua cookie `lams_refresh` HttpOnly, SameSite=Lax, path `/api/v1/auth`. PostgreSQL lưu SHA-256 của refresh token. Cấu hình `AUTH_COOKIE_SECURE=true` cho HTTPS production.

Core yêu cầu `LAMS_JWT_SECRET` (ít nhất 32 byte) khi khởi động; `.env.example` chỉ là giá trị mẫu cho local. Không dùng giá trị mẫu khi triển khai production. CORS chỉ cho các origin cấu hình trong `CORS_ALLOWED_ORIGINS`, có hỗ trợ cookie credentials.

```mermaid
sequenceDiagram
  actor U as Người dùng
  participant F as React
  participant C as Spring Core
  participant DB as lams_core
  U->>F: Nhập định danh + mật khẩu
  F->>C: POST /api/v1/auth/login (credentials include)
  C->>DB: Tìm user + roles
  C->>C: Kiểm tra hash / trạng thái
  C-->>F: access JWT + refresh cookie
  F->>C: API + access token
  C-->>F: Kết quả theo quyền
```

```mermaid
sequenceDiagram
  participant F as React
  participant C as Spring Core
  participant DB as lams_core
  F->>C: POST /api/v1/auth/refresh + cookie
  C->>DB: SELECT refresh token FOR UPDATE
  alt Token active
    C->>DB: Tạo token mới, revoke token cũ cùng transaction
    C-->>F: JWT mới + cookie mới
  else Token đã rotate/revoke
    C->>DB: Revoke toàn family
    C-->>F: 401
  end
```

```mermaid
sequenceDiagram
  participant F as React
  participant C as Spring Core
  participant DB as lams_core
  F->>C: POST /api/v1/auth/logout + cookie
  C->>DB: Revoke refresh family
  C-->>F: 204 + clear cookie
  Note over F,C: Access JWT cũ vẫn hợp lệ đến khi hết 15 phút
```

```mermaid
sequenceDiagram
  participant F as React (reload)
  participant C as Spring Core
  F->>C: POST /api/v1/auth/refresh + cookie
  alt Cookie hợp lệ
    C-->>F: JWT + user + rotated cookie
    F->>F: Khôi phục session trong memory
  else Không có/hết hạn
    C-->>F: 401
    F->>F: Anonymous
  end
```

Frontend gom các yêu cầu refresh đồng thời vào một promise để tránh reuse do rotation. Server dùng row lock; nếu token đã rotate bị dùng lại, cả family bị thu hồi. Account `LOCKED`/`DISABLED` không được login hoặc refresh. `/auth/me` kiểm tra trạng thái từ DB.
