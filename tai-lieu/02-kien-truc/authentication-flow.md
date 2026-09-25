# Authentication Flow Foundation

## Mục đích

Định hướng luồng đăng nhập; starter chỉ có form và security boundary, chưa có token endpoint.

```mermaid
sequenceDiagram
  actor U as Người dùng
  participant F as React
  participant C as Spring Core
  participant DB as lams_core
  U->>F: Nhập định danh + mật khẩu
  F->>C: POST /auth/login (planned, TLS)
  C->>DB: Tìm user + roles
  C->>C: Kiểm tra hash / trạng thái
  C-->>F: access token ngắn hạn + refresh cookie (planned)
  F->>C: API + access token
  C-->>F: Kết quả theo quyền
```

Refresh token nếu dùng phải lưu hash, rotate và revoke. Quyết định cookie/domain/CORS chỉ chốt cùng topology production.
