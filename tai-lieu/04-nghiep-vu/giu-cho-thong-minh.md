# Smart Hold Workflow

## Mục đích

Mô tả hàng đợi và pickup TTL, chưa phải thuật toán production.

```mermaid
flowchart TD
  A[Reader tạo hold] --> B[Validate policy + chống trùng]
  B --> C[Thêm vào queue theo quy tắc]
  C --> D{Có copy phù hợp?}
  D -- Có --> E[Atomic assignment: ON_HOLD]
  D -- Không --> F[Chờ COPY_RETURNED]
  F --> E
  E --> G[READY + pickup deadline]
  G --> H{Nhận đúng hạn?}
  H -- Có --> I[Loan + FULFILLED]
  H -- Không --> J[EXPIRED]
  J --> K{Còn người chờ?}
  K -- Có --> E
  K -- Không --> L[Copy AVAILABLE]
```

Queue order ban đầu là FIFO có tie-break deterministic; ưu tiên đặc biệt chỉ thêm khi policy được version/audit. Assignment phải compare-and-set copy và hold trong một transaction. Alternative edition chỉ là candidate có sự đồng ý/policy rõ, không tự thay thế ISBN.
