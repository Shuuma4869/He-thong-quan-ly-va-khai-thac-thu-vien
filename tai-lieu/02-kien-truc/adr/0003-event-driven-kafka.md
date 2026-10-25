# ADR 0003: Event-driven qua Kafka

**Trạng thái:** Core outbox/publisher và Insight consumer đã có, mặc định tắt

## Context
Insight cần fact circulation mà không làm chậm transaction Core.

## Decision
Core ghi transactional outbox cùng transaction; publisher chuyển event versioned sang Kafka; consumer idempotent cập nhật read model.

## Reason
Tránh dual write trực tiếp DB + broker và tách availability của Insight khỏi Core.

## Consequences
Eventual consistency, duplicate delivery và schema evolution phải được xử lý. Publisher chỉ bật khi cấu hình `OUTBOX_ENABLED=true`, consumer khi `NOTIFICATIONS_ENABLED=true`; ứng dụng không tự tạo topic. Cần chuẩn bị topic, DLQ và vận hành broker trước khi bật môi trường dùng chung. Transaction nghiệp vụ không phụ thuộc broker; ACK thành công nhưng chưa ghi được `published_at` sẽ dẫn tới gửi lặp cùng eventId. Insight ghi receipt và trạng thái thông báo trong cùng transaction, kiểm version để không làm lùi trạng thái. Chi tiết ở [outbox](../../05-api-va-event/outbox-delivery.md) và [consumer](../../05-api-va-event/circulation-notifications.md).
