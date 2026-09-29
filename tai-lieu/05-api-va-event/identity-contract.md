# Identity contract cho DEV 2

Phase 1A sở hữu bốn bảng `users`, `roles`, `user_roles`, `refresh_tokens` trong `lams_core` (Flyway V2). `users.id` là UUID ổn định để Member/Profile tham chiếu bằng foreign key. `member_code` là mã hiển thị/đăng nhập do Identity sinh; không dùng làm khóa quan hệ.

`users.status` gồm `ACTIVE`, `LOCKED`, `DISABLED`. Quyền được lấy từ `user_roles.role_code` qua `roles.code`, hiện có `READER`, `LIBRARIAN`, `ADMIN`; Spring Security ánh xạ thành `ROLE_READER`, `ROLE_LIBRARIAN`, `ROLE_ADMIN`. Đăng ký công khai chỉ tạo `READER`.

Member/Profile Phase 1B tạo bảng riêng tham chiếu `users.id`. Module đó không cập nhật trực tiếp `password_hash`, `email_normalized`, `member_code`, `status`, `user_roles` hoặc `refresh_tokens`; không tạo bảng account/password/role thứ hai. Thay đổi Identity đi qua API/service do DEV 1 sở hữu và được thống nhất contract trước khi triển khai.

Core API hiện thực: `POST /api/v1/auth/register`, `/login`, `/refresh`, `/logout`; `GET /api/v1/auth/me`. DTO `CurrentUserResponse` trả `id`, `memberCode`, `email`, `fullName`, `roles`. Không trả password hash hay refresh token. Chi tiết schema/status trong `contracts/openapi/core-api.yaml`.
