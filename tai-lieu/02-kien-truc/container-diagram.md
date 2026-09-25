# Container Architecture

## Mục đích

Mô tả trách nhiệm runtime và đường dữ liệu chính.

```mermaid
flowchart LR
  Browser[Browser] --> FE[React / Vite]
  FE -->|REST critical| Core[Spring Boot Core]
  FE -->|REST discovery| Insight[NestJS Insight]
  Core --> CoreDB[(PostgreSQL lams_core)]
  Insight --> InsightDB[(PostgreSQL lams_insight)]
  Core --> Redis[(Redis)]
  Insight --> Redis
  Core --> MinIO[(MinIO)]
  Core -->|outbox planned| Kafka{{Kafka}}
  Kafka -->|consumer planned| Insight
```

Core sở hữu transaction nghiệp vụ; Insight không ghi trực tiếp vào `lams_core`. Kafka truyền fact sau commit, không thay transaction đồng bộ.
