# Chiến lược kiểm thử

| Lớp | Mục tiêu | Công cụ/định hướng |
|---|---|---|
| Unit | rule/domain function nhanh, deterministic | JUnit/Mockito, Jest, Vitest |
| Slice | controller/security/repository riêng lớp | MockMvc, Spring slice |
| Integration | migration, constraint, query, Redis/Kafka adapter | Testcontainers PostgreSQL/Redis/Kafka |
| Contract | OpenAPI/AsyncAPI compatibility, provider/consumer | validator + schema test trong CI |
| E2E | hành trình thật qua UI/API | Playwright cho Auth, Profile và Member List |
| Concurrency | double borrow, hold assignment, expiry race | test đa thread + DB thật |
| Load | P95/error/resource theo workload | chỉ sau khi có traffic model |

Hiện có test health cho Spring/Nest, kiểm thử Auth và Member với PostgreSQL qua Testcontainers, kiểm tra cấu trúc contract Member và test giao diện React. `PostgresContainerFoundation` dùng chung cho integration test của Core. Không dùng H2 để thay PostgreSQL trong kiểm thử nghiệp vụ; dữ liệu test được tạo trong test và dọn bằng transaction/container, không seed catalog giả ở runtime.

`scripts/check-quality.ps1` chạy test/build Core, Prisma validate/test/build Insight, typecheck/lint/Vitest/build frontend và kiểm tra cấu hình Compose. CI chạy các bước tương ứng và build Docker image. Kiểm tra Member OpenAPI hiện chỉ bao phủ đường dẫn, quyền khai báo và cấu trúc DTO liên quan, chưa thay thế việc kiểm định toàn bộ OpenAPI.

E2E chạy riêng bằng `scripts/test-phase1-e2e.ps1`, yêu cầu Docker Linux, Java 21, Node 22/npm 10, dependencies đã cài và Chromium của Playwright (`cd frontend; npx playwright install chromium`). Script tạo PostgreSQL tạm với mật khẩu ngẫu nhiên và cổng loopback riêng, chạy Core/Vite, rồi dọn đúng container/process do lượt test tạo. Không sử dụng database hoặc volume của môi trường phát triển. Tài khoản staff chỉ được cấp role trong fixture của database tạm; ứng dụng không có API nâng quyền công khai.

Vitest dùng test doubles ở lớp mạng để kiểm tra các trạng thái lỗi và race condition. E2E dùng API thật, không intercept dữ liệu Member. Kết quả và giới hạn kiểm chứng được ghi tại [kiểm chứng Phase 1](phase-1-verification.md).

Quality gate dự kiến: compile/typecheck, unit/slice, migration integration, contract validation, lint, secret/dependency scan; E2E chạy khi feature có đường đi hoàn chỉnh.
