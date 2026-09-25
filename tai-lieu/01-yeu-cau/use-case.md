# Use Case Diagram

## Mục đích

Đặt phạm vi hành vi chính theo ba actor. Các use case nét đứt là định hướng nâng cao, chưa hiện thực.

```mermaid
flowchart LR
  R[READER] --> UC1((Tìm và xem tài liệu))
  R --> UC2((Theo dõi mượn / giữ chỗ))
  R -.-> UC3((Semantic discovery))
  L[LIBRARIAN] --> UC4((Quản lý catalog và copy))
  L --> UC5((Mượn / trả / gia hạn))
  L --> UC6((Vận hành hàng đợi hold))
  L -.-> UC7((Kiểm kê kệ trực tiếp))
  A[ADMIN] --> UC8((Quản lý user / role / policy))
  A --> UC9((Kiểm tra audit))
  A -.-> UC10((Phân tích và đề xuất bổ sung))
  A --> UC4
```

Reader không thực hiện nghiệp vụ quầy; Librarian có quyền vận hành nhưng không tự thay đổi vai trò; Admin chịu cấu hình và giám sát.
