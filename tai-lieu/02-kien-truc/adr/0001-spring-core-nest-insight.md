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

## Bổ sung Phase 2.5

Insight sở hữu lịch sử tra ISBN trong PostgreSQL riêng bằng Prisma. Đây là dữ liệu nghiệp vụ của quá trình discovery, không phải bản sao Book/Edition của Core. Chỉ lưu UUID actor, ISBN, provider/status và thời gian; replay gọi lại nguồn hiện tại. Core vẫn xác thực principal/role; Insight kiểm owner mỗi query. Read model/search/event nói ở quyết định gốc vẫn planned. Phương án hybrid được DEV1 chấp thuận cho triển khai; việc đáp ứng scope NestJS của học phần còn chờ giảng viên xác nhận. Chi tiết ở [ORM](../metadata-history-orm.md).
