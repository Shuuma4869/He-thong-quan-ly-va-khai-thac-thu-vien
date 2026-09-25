# Workflow kiểm kê kệ sách

## Mục đích

Đối chiếu snapshot mong đợi với scan thực tế mà không làm mất lịch sử.

```mermaid
flowchart LR
  A[Bắt đầu session] --> B[Chốt scope + expected snapshot]
  B --> C[Scan barcode theo thứ tự kệ]
  C --> D{Barcode hợp lệ?}
  D -- Không --> E[Anomaly UNKNOWN]
  D -- Có --> F[So expected location/status/order]
  F --> G{Khớp?}
  G -- Không --> H[Anomaly MISSHELVED / STATUS_MISMATCH]
  G -- Có --> I[Scan matched]
  C --> J[Kết thúc scan]
  J --> K[Phát hiện expected chưa scan: MISSING]
  K --> L[Review và resolve anomaly]
  L --> M[Finish session + summary]
```

Scan là append-only trong session; duplicate scan được nhận biết, không tăng số copy. Sửa vị trí/trạng thái là command riêng có quyền và audit, không tự động vì một scan đơn lẻ.
