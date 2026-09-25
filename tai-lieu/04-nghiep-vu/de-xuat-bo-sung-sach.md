# Workflow đề xuất bổ sung sách

## Mục đích

Tạo đề xuất mua thêm có evidence, không tự động đặt mua.

```mermaid
flowchart LR
  H[Hold pressure] --> D[Chuẩn hóa demand signals]
  U[Unavailable views] --> D
  Z[Zero-result searches] --> D
  C[Circulation velocity] --> D
  F[Favorites] --> D
  D --> S[Score theo cửa sổ thời gian]
  S --> E[Evidence + explanation]
  E --> R[Recommendation DRAFT]
  R --> A{Admin/Librarian review}
  A -- Duyệt --> P[Procurement workflow tương lai]
  A -- Từ chối --> X[Lưu reason để hiệu chỉnh]
```

Score không dùng dữ liệu nhạy cảm cá nhân nếu không cần. Mọi recommendation giữ component score, data window và model/rule version. Ngân sách, số copy đang có, sách đã đặt và mùa vụ là guardrail; con người quyết định cuối.
