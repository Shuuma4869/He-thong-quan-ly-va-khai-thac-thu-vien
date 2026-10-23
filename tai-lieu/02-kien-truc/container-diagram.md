# Container Architecture

## Mục đích

Mô tả trách nhiệm runtime và đường dữ liệu chính.

```mermaid
flowchart LR
  Desktop[Tauri / WebView2 Windows] --> FE[React UI]
  Browser[Web mode khi cần] --> FE
  FE -->|REST critical| Core[Spring Boot Core]
  FE -->|REST discovery| Insight[NestJS Insight]
  Core --> CoreDB[(PostgreSQL lams_core)]
  Insight --> InsightDB[(PostgreSQL lams_insight)]
  Insight -->|Core xác minh principal| Core
  Insight -->|Metadata HTTP giới hạn| Provider[Open Library / Wikimedia; Google opt-in]
  Core -.planned.-> Redis[(Redis)]
  Insight -.planned cache phân tán.-> Redis
  Core -.object storage planned.-> MinIO[(MinIO)]
  Core -.outbox planned.-> Kafka{{Kafka}}
  Kafka -.consumer planned.-> Insight
```

Core sở hữu transaction nghiệp vụ; Insight không ghi trực tiếp vào `lams_core`. Kafka truyền fact sau commit, không thay transaction đồng bộ.

Tauri không phải backend mới. Release đóng gói static assets; Vite chỉ phục vụ dev. Auth/Member/Catalog/Inventory/media và metadata/history là đường REST có implementation. InsightDB lưu trace ISBN qua Prisma; cache provider hiện trong memory. Search/read model, event và object storage còn planned. Xem [ADR Windows desktop](adr/0007-windows-desktop-tauri.md).
