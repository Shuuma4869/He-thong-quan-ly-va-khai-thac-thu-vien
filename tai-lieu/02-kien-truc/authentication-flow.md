# Authentication Flow — Phase 1A

## Mục đích

Identity nằm trong Spring Core và `lams_core`. Đăng ký chỉ cấp `READER`. Access JWT sống 15 phút trong memory của frontend; opaque refresh token chỉ đi qua cookie `lams_refresh` HttpOnly, path `/api/v1/auth`. Local dùng SameSite=Lax. PostgreSQL lưu SHA-256 của refresh token.

Core yêu cầu `LAMS_JWT_SECRET` (ít nhất 32 byte) khi khởi động; `.env.example` chỉ là giá trị mẫu cho local. Không dùng giá trị mẫu khi triển khai production. CORS chỉ cho các origin cấu hình trong `CORS_ALLOWED_ORIGINS`, có hỗ trợ cookie credentials.

Profile `pilot` phục vụ client khác site với API: refresh cookie bắt buộc `Secure; SameSite=None`, mọi POST `/api/v1/auth/*` phải có Origin HTTPS chính xác trong allowlist và `X-LAMS-Client: 1`. Header không phải secret; nó buộc yêu cầu cross-origin từ trình duyệt đi qua preflight, kết hợp kiểm tra Origin phía server để chống CSRF. Yêu cầu không có Origin cũng bị từ chối trong pilot. API nghiệp vụ vẫn xác thực bằng Bearer JWT, không bằng refresh cookie. Không bật cookie None khi thiếu Secure hoặc thiếu bộ lọc trusted origin; server từ chối cấu hình đó khi khởi động.

Client pilot/production bắt buộc Core URL HTTPS, không fallback localhost; Insight có thể chưa cấu hình. Timeout mặc định 15 giây, cấu hình được trong khoảng 1–120 giây. Lỗi timeout/network không tự gửi lại POST; người dùng nhận thông báo để quyết định thử lại. Cơ chế thử lại sau 401 bên dưới vẫn chỉ thực hiện một lần. Xem [runbook pilot](../08-van-hanh/cloud-pilot.md) trước khi build bản kết nối Internet. Chính sách chặn cookie bên thứ ba của máy vẫn cần kiểm tra thực tế trên WebView2; unit/integration test không thay thế kiểm tra đó.

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

## Hồ sơ và đổi thông tin đăng nhập

`/api/v1/me/account` trả về tên, mã thành viên, trạng thái, email đang dùng, số điện thoại và email đang chờ xác minh. Người dùng có thể sửa tên, thêm hoặc bỏ số điện thoại theo định dạng E.164. Số điện thoại có ràng buộc duy nhất ở PostgreSQL; không có bước xác thực quyền sở hữu số này, nên hiện chỉ dùng làm thông tin hồ sơ, không dùng để đăng nhập hoặc khôi phục tài khoản.

Đổi mật khẩu yêu cầu mật khẩu hiện tại. Core lưu hash mới, tăng `credential_version` và thu hồi refresh token trong cùng transaction. Mỗi lần xác thực JWT, Core so phiên bản trong token với tài khoản hiện tại; access token cũ hết hiệu lực ngay sau khi đổi mật khẩu. Giao diện chuyển về trang đăng nhập sau khi thao tác thành công. Việc kiểm phiên bản thêm một truy vấn cơ sở dữ liệu cho mỗi request có JWT, cần theo dõi tải nếu triển khai quy mô lớn.

Đổi email yêu cầu mật khẩu hiện tại. Core tạo mã ngẫu nhiên 12 ký tự, chỉ lưu BCrypt hash và thời hạn 15 phút trong `users`; mã được gửi tới địa chỉ mới qua `EmailVerificationSender`. Mặc định adapter gửi thư bị tắt và API trả 503, không ghi yêu cầu mới. Khi SMTP được bật, Core cho gửi tối đa 5 lần trong 24 giờ, cách nhau ít nhất 1 phút. Mỗi lần gửi lại thay mã cũ; người dùng có thể hủy yêu cầu. Nhập sai tối đa 5 lần. `POST /api/v1/me/account/email-confirm` khóa dòng tài khoản, kiểm mã, rồi đổi email và thu hồi các phiên trong cùng transaction. JWT cũ hết hiệu lực nhờ `credential_version`. Core chỉ kiểm tra địa chỉ có thuộc tài khoản khác hay không **sau khi người yêu cầu đã chứng minh quyền sở hữu hộp thư**, tránh dò tài khoản qua API yêu cầu mã. Nếu email đã được sử dụng, Core trả 409 và giữ email cũ. Địa chỉ đang chờ ở tài khoản khác vẫn có thể trả 409 sớm do ràng buộc duy nhất của PostgreSQL; thông báo không tiết lộ tài khoản đó.

Mailpit ở profile `email-dev` chỉ nhận thư trên máy phát triển. Bật `LAMS_EMAIL_ENABLED=true` sau khi đã chạy Mailpit và khởi động lại Core; thư không rời máy, xem tại `http://localhost:8025`. Môi trường thật cần cấu hình SMTP, TLS, địa chỉ gửi và quyền vận hành riêng. Migration V27 giữ các yêu cầu email cũ chưa có mã; người dùng phải gửi lại để nhận mã. Code gửi thư nằm trong transaction tạo yêu cầu: lỗi SMTP làm rollback, nhưng nếu thư đã ra ngoài rồi transaction thất bại muộn, mã có thể không dùng được; người dùng gửi lại sau giới hạn 1 phút. Không ghi mã vào log hoặc API.

Profile dùng `GET /api/v1/me/profile`; Member List dùng `GET /api/v1/members` và kiểm quyền/trạng thái hiện tại từ DB. Frontend dùng chung API client và AuthProvider, không lưu token ở localStorage. Mỗi truy vấn Member có cache key theo user và bộ lọc, có AbortSignal; đăng xuất xóa cache và chặn phản hồi refresh cũ khôi phục phiên. Nếu rotation đang chạy, frontend đợi nó kết thúc trước khi gửi logout để server thu hồi đúng refresh family. Một request bị 401 chỉ thử lại một lần sau refresh; nếu vẫn 401 thì kết thúc phiên phía frontend.
