# ADR 0003: Event-driven qua Kafka

**Trạng thái:** Planned contract

## Context
Insight cần fact circulation mà không làm chậm transaction Core.

## Decision
Core ghi transactional outbox cùng transaction; publisher chuyển event versioned sang Kafka; consumer idempotent cập nhật read model.

## Reason
Tránh dual write trực tiếp DB + broker và tách availability của Insight khỏi Core.

## Consequences
Eventual consistency, duplicate delivery và schema evolution phải được xử lý. Starter chưa có publisher/consumer và chưa tự tạo topic.
