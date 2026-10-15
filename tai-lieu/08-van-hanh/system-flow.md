# Tổng quan system flow

## Mục đích

Phân biệt request đồng bộ và event bất đồng bộ planned.

```mermaid
flowchart LR
  B[Tauri WebView2 hoặc web mode] --> R[React]
  R -->|Critical REST| S[Spring Core]
  R -->|Discovery REST| N[Nest Insight]
  S -->|transaction| CDB[(lams_core)]
  N -->|read model| IDB[(lams_insight)]
  S --> RC[(Redis)]
  N --> RC
  S -.object storage planned.-> OS[(MinIO)]
  S -.outbox publisher.-> K{{Kafka}}
  K -.domain fact.-> N
  S -->|HTTP response| R
  N -->|HTTP response| R
```

```mermaid
sequenceDiagram
  participant C as Core transaction
  participant O as outbox_events
  participant P as Publisher (planned)
  participant K as Kafka
  participant I as Insight consumer (planned)
  C->>O: Ghi event cùng COMMIT
  P->>O: Lấy event chưa publish
  P->>K: Publish eventId/version
  K-->>P: Ack
  P->>O: Đánh dấu published
  K->>I: At-least-once delivery
  I->>I: Dedupe + update read model
```

Request ID đi từ client qua log; correlation ID sẽ nối command và event khi publisher/consumer được triển khai. Redis là tối ưu/coordination, không là source of truth. Outbox retry và việc không rollback Core khi Kafka/Insight lỗi là thiết kế mục tiêu, chưa có nghiệp vụ Loan để xác nhận bằng runtime. Desktop release gọi API loopback HTTP, không phải HTTPS production; xem [desktop Windows](desktop-windows.md).
