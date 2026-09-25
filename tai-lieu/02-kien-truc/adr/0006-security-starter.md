# ADR 0006: Security foundation trước Phase Auth

## Trạng thái

Accepted.

## Quyết định

Giữ Spring Security để khóa mặc định mọi endpoint chưa được thiết kế. Chỉ `/api/v1/health` và `/actuator/health` được public; HTTP Basic và form login bị tắt. `UserDetailsServiceAutoConfiguration` bị loại khỏi starter để không sinh user/password ngẫu nhiên khi chưa có Phase Auth.

## Hệ quả

Starter không có demo credential hoặc authentication giả. Phase Auth phải thay thế cấu hình này bằng identity/RBAC production và test tương ứng.
