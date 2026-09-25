# Quy ước API và event

## HTTP

- Base path `/api/v1`; resource là danh từ số nhiều, UTF-8 JSON.
- `200` đọc/cập nhật, `201` tạo, `204` xóa không body, `400` malformed, `401`, `403`, `404`, `409` xung đột, `422` vi phạm business/validation, `429`, `500` lỗi ngoài dự kiến.
- Lỗi theo Problem Details: `type`, `title`, `status`, `detail`, `instance`, `requestId`, `errors[]`; message hướng người dùng bằng tiếng Việt ở UI, error code ổn định bằng tiếng Anh.
- Date/time dùng ISO 8601 UTC (`2026-09-25T10:00:00Z`); local date dùng `YYYY-MM-DD`; tiền luôn có currency.
- Pagination mặc định `page=0&size=20`, giới hạn size; collection trả `items` và `page {number,size,totalElements,totalPages}`. Dataset biến động lớn sẽ chuyển cursor theo contract riêng.
- Filter bằng query parameter; sort dạng `sort=field,asc`. Chỉ field allowlist được phép.
- Nhận/trả `X-Request-ID`; server tự sinh nếu thiếu và đưa vào log/event correlation.
- Command dễ retry (mượn/giữ chỗ/thanh toán nếu có) phải có idempotency key trước khi public.

## Event

Envelope có `eventId`, `eventType`, `occurredAt`, `aggregateId`, `correlationId`, `version`, `data`. Event là fact quá khứ, immutable, versioned; consumer idempotent theo event ID. Không đưa secret hoặc PII không cần thiết vào Kafka.
