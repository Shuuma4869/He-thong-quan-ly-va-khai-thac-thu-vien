# Tổng quan system flow

## Mục đích

Phân biệt request đồng bộ với luồng event đã có mã nguồn nhưng mặc định chưa bật để vận hành chung.

```mermaid
flowchart LR
  B[Tauri WebView2 hoặc web mode] --> R[React]
  R -->|Critical REST| S[Spring Core]
  R -->|Discovery REST| N[Nest Insight]
  S -->|transaction| CDB[(lams_core)]
  N -->|Prisma: history và notification read model| IDB[(lams_insight)]
  N -->|auth/me kiểm principal và role| S
  N -->|tra ISBN hiện tại, không lưu payload| MP[Metadata provider]
  S -.cache/coordination planned.-> RC[(Redis)]
  N -.cache phân tán planned.-> RC
  S -.publisher khi được bật.-> K{{Kafka}}
  K -.consumer khi được bật.-> N
  S -->|HTTP response| R
  N -->|HTTP response| R
```

```mermaid
sequenceDiagram
  participant C as Core transaction
  participant O as outbox_events
  participant P as Publisher
  participant K as Kafka
  participant I as Insight consumer
  C->>O: Ghi event cùng COMMIT
  P->>O: Lấy event chưa publish
  P->>K: Publish eventId/version
  K-->>P: Ack
  P->>O: Đánh dấu published
  K->>I: At-least-once delivery
  I->>I: Dedupe + update read model
```

Redis là tối ưu/coordination, không là source of truth. Giao dịch Loan/Hold ghi outbox ở Core; publisher và consumer có retry, dedupe và read model nhưng đều mặc định tắt. Test riêng của hai phía không thay thế nghiệm thu xuyên suốt từ HTTP Core đến thông báo Insight. MinIO tùy chọn và chưa được Core dùng để lưu ảnh. Desktop release gọi API loopback HTTP, chưa phải HTTPS production; xem [desktop Windows](desktop-windows.md).
