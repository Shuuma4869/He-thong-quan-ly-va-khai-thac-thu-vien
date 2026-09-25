# Yêu cầu phi chức năng

- **Security:** mật khẩu băm mạnh; least privilege; input validation; CSRF/CORS theo mô hình triển khai; không log secret/PII; dependency scan trước release.
- **Performance:** API đọc phổ biến P95 mục tiêu dưới 500 ms ở tải đã định nghĩa; phân trang bắt buộc; index dựa trên query thực tế.
- **Concurrency:** loan/return/hold assignment dùng transaction và optimistic/pessimistic control phù hợp; một copy không có hai active loan.
- **Availability:** health tách liveness/readiness trong production; event consumer idempotent; retry có giới hạn và DLQ khi thiết kế topic.
- **Accessibility:** WCAG 2.2 AA làm mục tiêu; bàn phím, focus, label, contrast và reduced motion.
- **Auditability:** hành vi nhạy cảm ghi actor, action, subject, thời gian, request/correlation ID; audit append-only.
- **Maintainability:** feature boundary rõ, ADR cho quyết định lớn, contract versioned, migration tiến về trước.
- **Observability:** structured log, request ID, metrics latency/error, trace qua HTTP/event; không tuyên bố SLO trước khi đo tải.
