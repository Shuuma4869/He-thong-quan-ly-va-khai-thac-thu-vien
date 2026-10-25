# ADR 0003: Event-driven qua Kafka

**Trạng thái:** Core outbox và publisher đã có; consumer chưa triển khai

## Context
Insight cần fact circulation mà không làm chậm transaction Core.

## Decision
Core ghi transactional outbox cùng transaction; publisher chuyển event versioned sang Kafka; consumer idempotent cập nhật read model.

## Reason
Tránh dual write trực tiếp DB + broker và tách availability của Insight khỏi Core.

## Consequences
Eventual consistency, duplicate delivery và schema evolution phải được xử lý. Publisher chỉ bật khi cấu hình `OUTBOX_ENABLED=true`, không tự tạo topic. Cần chuẩn bị topic, consumer dedupe và vận hành broker trước khi bật môi trường dùng chung. Transaction nghiệp vụ không phụ thuộc broker; ACK thành công nhưng chưa ghi được `published_at` sẽ dẫn tới gửi lặp cùng eventId. Chi tiết khóa, retry, migration và giới hạn nằm trong [vận hành outbox](../../05-api-va-event/outbox-delivery.md).
