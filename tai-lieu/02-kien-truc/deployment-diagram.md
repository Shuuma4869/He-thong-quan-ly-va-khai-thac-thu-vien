# Deployment Diagram

## Mục đích

Thể hiện topology local hiện tại và hướng production chưa triển khai.

```mermaid
flowchart TB
  subgraph Laptop[Máy developer]
    FE[Node: Vite dev server]
    Core[JVM: Core Service]
    Insight[Node: Insight Service]
    subgraph Docker[Docker Compose: lams]
      PG[(PostgreSQL)]
      Redis[(Redis)]
      Kafka[Kafka KRaft]
      MinIO[MinIO]
    end
    FE --> Core
    FE --> Insight
    Core --> PG
    Insight --> PG
    Core --> Redis
    Insight --> Kafka
  end
  Prod[Production topology: chưa quyết định] -.sau này.-> LB[Reverse proxy / orchestrator / managed data services]
```

Local dùng hybrid để feedback nhanh. Production cần threat model, backup, HA, secret manager và sizing trước khi chọn nền tảng; sơ đồ không ngụ ý hệ thống đã deploy.
