# ADR 0001: Spring Core và NestJS Insight

**Trạng thái:** Chấp nhận cho foundation

## Context
Giao dịch circulation cần nhất quán mạnh; discovery/analytics có nhịp thay đổi và workload khác.

## Decision
Spring Boot sở hữu domain transaction-critical. NestJS sở hữu read model, metadata integration, discovery và intelligence.

## Reason
Ranh giới theo đặc tính dữ liệu, không chia service theo framework tùy ý; mỗi phía có thể phát triển độc lập qua contract.

## Consequences
Cần event idempotent, observability xuyên service và tránh business rule bị nhân đôi. Starter chỉ tạo hai deployable, không tạo thêm microservice.
