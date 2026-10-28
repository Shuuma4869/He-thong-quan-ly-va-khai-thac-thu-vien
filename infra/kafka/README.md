# Kafka local

Kafka chạy ở chế độ KRaft một broker cho phát triển local. Core outbox dùng `lams.circulation.events.v1` và `lams.hold.events.v1`; Insight consumer dùng thêm `lams.notifications.dlq.v1`. Compose không tự tạo topic. Trước khi bật `OUTBOX_ENABLED=true` và `NOTIFICATIONS_ENABLED=true`, người vận hành tạo ba topic trên và kiểm tra retention theo chính sách lưu trữ của đơn vị. Cấu hình mặc định giữ cả hai cờ ở `false`.

Xem [hộp thông báo giữ chỗ](../../tai-lieu/02-kien-truc/hop-thong-bao.md) để biết luồng transaction, duplicate, DLQ và giới hạn retention hiện tại. Không dùng Kafka một broker local làm bằng chứng sẵn sàng production.
