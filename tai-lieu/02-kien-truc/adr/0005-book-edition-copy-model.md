# ADR 0005: Mô hình Book — Edition — Copy

**Trạng thái:** Chấp nhận

## Context
Một tác phẩm có nhiều ấn bản; một ấn bản có nhiều bản vật lý với trạng thái và vị trí riêng.

## Decision
`Book 1—N Edition 1—N BookCopy`. ISBN nằm ở Edition; barcode và trạng thái nằm ở Copy. Availability suy từ copy/read model được quản lý.

## Reason
Ngăn gộp sai metadata và tồn kho; hỗ trợ chuyển kệ, mất/hỏng, alternative edition và audit.

## Consequences
Query UI phức tạp hơn mô hình một bảng, cần projection/search document; đổi copy state phải tuân state machine và concurrency rule.
