# Chiến lược kiểm thử

| Lớp | Mục tiêu | Công cụ/định hướng |
|---|---|---|
| Unit | rule/domain function nhanh, deterministic | JUnit/Mockito, Jest, Vitest |
| Slice | controller/security/repository riêng lớp | MockMvc, Spring slice |
| Integration | migration, constraint, query, Redis/Kafka adapter | Testcontainers PostgreSQL/Redis/Kafka |
| Contract | OpenAPI/AsyncAPI compatibility, provider/consumer | validator + schema test trong CI |
| E2E | hành trình thật qua UI/API | Playwright khi MVP có workflow |
| Concurrency | double borrow, hold assignment, expiry race | test đa thread + DB thật |
| Load | P95/error/resource theo workload | chỉ sau khi có traffic model |

Hiện có test health cho Spring/Nest, test giao diện React và kiểm thử Auth với PostgreSQL qua Testcontainers. `PostgresContainerFoundation` dùng chung cho integration test của Core. Không dùng H2 để thay PostgreSQL trong kiểm thử nghiệp vụ; dữ liệu test được tạo trong test và dọn bằng transaction/container, không seed catalog giả ở runtime.

Quality gate dự kiến: compile/typecheck, unit/slice, migration integration, contract validation, lint, secret/dependency scan; E2E chạy khi feature có đường đi hoàn chỉnh.
