# Deployment Diagram

## Mục đích

Thể hiện topology local hiện tại và hướng production chưa triển khai.

```mermaid
flowchart TB
  subgraph Laptop[Máy developer]
    FE[Tauri + WebView2: React assets]
    Vite[Node: Vite chỉ khi phát triển]
    Core[JVM: Core Service]
    Insight[Node: Insight Service]
    subgraph Docker[Docker Compose: lams]
      PG[(PostgreSQL)]
      Redis[(Redis)]
      Kafka[Kafka KRaft]
      MinIO[MinIO]
    end
    Vite -.hot reload dev.-> FE
    FE --> Core
    FE --> Insight
    Core --> PG
    Insight --> PG
    Core --> Redis
    Insight --> Kafka
  end
  Prod[Production topology: chưa quyết định] -.sau này.-> LB[Reverse proxy / orchestrator / managed data services]
```

Local dùng desktop client và backend/database riêng. Release không cần Vite; bộ cài không chứa Core, Insight hoặc PostgreSQL. Web mode vẫn dùng cùng React khi cần phát triển/kiểm thử. Xem [desktop Windows](../08-van-hanh/desktop-windows.md). Production cần threat model, backup, HA, secret manager và sizing trước khi chọn nền tảng; sơ đồ không ngụ ý hệ thống đã deploy.
