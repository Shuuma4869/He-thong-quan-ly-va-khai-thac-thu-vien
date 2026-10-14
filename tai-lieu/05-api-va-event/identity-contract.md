# Identity contract cho DEV 2

Phase 1A sở hữu bốn bảng `users`, `roles`, `user_roles`, `refresh_tokens` trong `lams_core` (Flyway V2). `users.id` là UUID ổn định để Member/Profile tham chiếu bằng foreign key. `member_code` là mã hiển thị/đăng nhập do Identity sinh; không dùng làm khóa quan hệ.

`users.status` gồm `ACTIVE`, `LOCKED`, `DISABLED`. Quyền được lấy từ `user_roles.role_code` qua `roles.code`, hiện có `READER`, `LIBRARIAN`, `ADMIN`; Spring Security ánh xạ thành `ROLE_READER`, `ROLE_LIBRARIAN`, `ROLE_ADMIN`. Đăng ký công khai chỉ tạo `READER`.

Member Phase 1B đọc projection từ Identity theo [Member contract](member-contract.md). Phạm vi đã merge trong PR #5 không tạo bảng `member_profiles` hoặc migration rỗng vì chưa có trường Member-specific được duyệt; `GET /api/v1/me/profile` trả `profile: null`. Chỉ đề xuất bảng riêng tham chiếu `users.id` khi có yêu cầu lưu dữ liệu bổ sung.

Member không cập nhật `full_name`, `email`, `password_hash`, `email_normalized`, `member_code`, `status`, `user_roles` hoặc `refresh_tokens`; không tạo bảng account/password/role thứ hai. Thay đổi Identity cần API/service riêng và contract được thống nhất. Member List kiểm cả quyền JWT và trạng thái/quyền hiện tại từ Identity, nên token staff cũ không giữ quyền đọc sau khi khóa tài khoản hoặc thu hồi role.

Core API hiện thực: `POST /api/v1/auth/register`, `/login`, `/refresh`, `/logout`; `GET /api/v1/auth/me`. DTO `CurrentUserResponse` trả `id`, `memberCode`, `email`, `fullName`, `roles`. Không trả password hash hay refresh token. Chi tiết schema/status trong `contracts/openapi/core-api.yaml`.
