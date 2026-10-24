# Chiến lược kiểm thử

| Lớp | Mục tiêu | Công cụ/định hướng |
|---|---|---|
| Unit | rule/domain function nhanh, deterministic | JUnit/Mockito, Jest, Vitest |
| Slice | controller/security/repository riêng lớp | MockMvc, Spring slice |
| Integration | migration, constraint, query, Redis/Kafka adapter | Testcontainers PostgreSQL/Redis/Kafka |
| Contract | OpenAPI/AsyncAPI compatibility, provider/consumer | validator + schema test trong CI |
| E2E | hành trình thật qua UI/API | Playwright cho Auth, Profile, Member, Catalog/Inventory và metadata |
| Concurrency | double borrow, hold assignment, expiry race | test đa thread + DB thật |
| Load | P95/error/resource theo workload | chỉ sau khi có traffic model |

Hiện có test health cho Spring/Nest, kiểm thử Auth/Member/Catalog với PostgreSQL qua Testcontainers, kiểm tra OpenAPI Member/Catalog và test giao diện React. Catalog kiểm migration mới, FK/unique, quyền, transaction rollback, phân trang và status Copy; không dùng H2 thay PostgreSQL. `PostgresContainerFoundation` dùng chung cho integration test của Core. Dữ liệu test được tạo trong test và dọn trong database/container thử nghiệm, không seed catalog giả ở runtime.

`scripts/check-quality.ps1` chạy test/build Core, Prisma validate/test/build Insight, typecheck/lint/Vitest/build frontend và kiểm tra cấu hình Compose. CI chạy các bước tương ứng và build Docker image. `scripts/validate-openapi.py` kiểm định đầy đủ hai tài liệu Core/Insight bằng OpenAPI 3.1 validator trong job `api-contracts`; cài dependency từ `contracts/openapi/requirements.txt` vào môi trường Python riêng. Các contract test Java kiểm thêm đường dẫn, quyền và cấu trúc DTO, không thay thế validator này.

E2E chạy riêng bằng `scripts/test-phase1-e2e.ps1`, yêu cầu Docker Linux, Java 21, Node 22/npm 10, dependencies đã cài và Chromium của Playwright (`cd frontend; npx playwright install chromium`). Script tạo PostgreSQL tạm với mật khẩu ngẫu nhiên và cổng loopback riêng, chạy Core/Insight/Vite, rồi dọn đúng container/process do lượt test tạo. Không sử dụng database hoặc volume của môi trường phát triển. Tài khoản staff chỉ được cấp role trong fixture của database tạm; ứng dụng không có API nâng quyền công khai.

Vitest dùng test doubles ở lớp mạng để kiểm tra các trạng thái lỗi và race condition. E2E dùng API thật, không intercept dữ liệu Member. Kết quả mỗi lượt chạy xem trực tiếp ở terminal/CI; không lưu thêm file báo cáo audit hoặc nội dung PR trong source.

Circulation/Hold: `LoanCommandIntegrationTest` kiểm mượn/trả, quota và retry; `HoldIntegrationTest` kiểm FIFO theo chi nhánh/ấn bản, nhận đúng người, hủy/hết hạn/phân bổ, gia hạn và tranh chấp transaction trên PostgreSQL. Clock điều khiển kiểm đúng deadline mà không chờ thật. Test chờ khóa dùng `pg_blocking_pids`; không dùng thời gian chạy làm bằng chứng khóa. `LoanSchemaTest` kiểm nâng V17 → V18 giữ Loan/receipt cũ và các constraint mới.

Maven test tắt timer tự chạy của Hold để Spring context cache không tiếp tục dùng Testcontainer đã đóng. Nghiệp vụ job vẫn được gọi trực tiếp trên PostgreSQL trong `HoldIntegrationTest`; `HoldExpiryJobTest` kiểm con trỏ 100 Book/lượt và retry khi một Book lỗi. Ứng dụng bình thường mặc định bật timer. Bộ test backend này không thay cho E2E giao diện lưu thông hoặc Kafka delivery.

Read-side Phase 4: `LoanHistoryIntegrationTest` dùng PostgreSQL/HTTP thật để kiểm owner, quyền hiện hành, filter [from,to), biên overdue, trang ổn định khi trùng thời gian, chi nhánh/ấn bản lịch sử sau khi Copy đổi vị trí, tổng báo cáo theo múi giờ và GET không ghi nghiệp vụ. Fixture hơn 10000 nhóm kiểm từ chối báo cáo quá lớn thay vì xuất thiếu dữ liệu. `LoanCsvExporterTest` kiểm UTF-8 BOM, file rỗng, dấu phẩy/nháy kép/xuống dòng và công thức đầu ô; HTTP test đối chiếu byte CSV với cùng report snapshot. Đây chưa phải kiểm mở file bằng Excel hoặc đo tải production.

Các regression bắt buộc của Phase 1: principal tự xem hồ sơ, DTO allowlist, GET không ghi dữ liệu, invalid/expired JWT, staff bị khóa hoặc thu hồi role khi JWT còn hạn, query literal `%`/`_`/`\`, SQL injection, phân trang ổn định khi trùng tên, debounce giữ focus, stale response và refresh đến muộn sau logout. UI phải xử lý loading/error/retry/empty, `profile: null`, deep link và reload/Back.

Phase 2 bổ sung kiểm role hiện tại trong DB cho Catalog, Publisher read-only với Reader, Unicode NFKC, nâng cấp V11 từ dữ liệu cũ, collision migration không ghi dở, filter/count/pagination và rollback. Test concurrency phối hợp hai transaction PostgreSQL theo cả hai thứ tự khóa Shelf/Copy, không dựa vào sleep để đoán race. Media kiểm quyền, version, MIME/signature, dung lượng, timeout và không ghi dữ liệu khi kiểm nguồn thất bại.

Insight test dùng phản hồi provider kiểm soát được để xác minh ISBN chính xác, fallback, liên kết định danh tác giả hai chiều, provenance/license, timeout/cache/rate limit và quyền từ Core. E2E gọi provider thật nhưng chấp nhận trạng thái unavailable/not-found rõ ràng: provider bên ngoài không phải điều kiện mạng ổn định của CI. Một lượt E2E đi qua fallback không chứng minh provider đã trả metadata thành công. Google Books mặc định tắt; test adapter không đồng nghĩa đã nghiệm thu tích hợp Google với API key thật.

Phase 2.5: `npm test` ở Insight chạy unit/DTO/provider/guard và HTTP boundary với test doubles. `npm run test:integration` chạy PostgreSQL Docker thật riêng biệt, kiểm fresh migration, nâng cấp từ foundation trong schema riêng, dữ liệu sau reconnect, owner/filter/page và constraints. Không skip suite này khi thiếu Docker. E2E bổ sung lưu history → reload → cross-owner 404 → xác nhận xóa; database Insight tách khỏi Core trong cùng container test. Frontend có regression request đến muộn sau đổi tài khoản, không retry write bằng principal mới. Xem [trace theo AC](../01-yeu-cau/user-stories.md) và [security matrix](security-matrix.md).

[Ma trận từng AC](story-test-matrix.md) phân biệt pure unit, frontend component, HTTP double và PostgreSQL/E2E thật. Job `web-e2e` dùng `scripts/test-web-e2e-ci.sh` trên Ubuntu với cùng suite Playwright; bootstrap test chỉ tạo container gắn nhãn, port loopback và database riêng. Log/build output không được commit; artifact test giữ giới hạn thời gian. Không đưa log chứa URL database vào artifact công khai.

Quality gate: compile/typecheck, unit/integration, migration upgrade, contract validation, lint, review diff/secrets và E2E cho đường đi đã triển khai. Kiểm thử không chứng minh không còn mọi lỗ hổng; cloud, load và nghiệp vụ các phase sau cần nghiệm thu riêng.

Phase 4 command: `LoanCommandIntegrationTest` dùng PostgreSQL thật, HTTP staff/current-role, replay, request key sai nội dung, rollback cả Loan/Copy/audit/outbox/receipt, hai người tranh Copy cuối và một Reader tranh quota qua hai Book. Test khóa dùng `pg_blocking_pids`/`pg_stat_activity`; khi quan sát từ transaction dài phải gọi `pg_stat_clear_snapshot()` để không giữ snapshot thống kê cũ. `LoanSchemaTest` kiểm riêng mốc V16 và nâng V16 → V17 giữ Loan có sẵn. Không gọi test API là E2E giao diện, không dùng EXE Phase 3 làm bằng chứng UI lưu thông chưa triển khai.

Desktop: `scripts/test-phase1-e2e.ps1 -Desktop` chạy cùng kịch bản trên WebView2 thật của EXE release thay vì Vite/Chromium. Rust có test allowlist điều hướng, fmt/clippy; CI Windows build NSIS. Xem [runbook desktop](../08-van-hanh/desktop-windows.md) về cổng, profile test và điều kiện môi trường. CI build không thay cho E2E native local.

Reader lưu thông: `CirculationFlow` kiểm đúng Edition mặc định, anyEdition chủ động, chỉ gọi API chi nhánh nhận, retry giữ requestId, gửi kép, xác nhận hủy/gia hạn và URL sai. E2E đi qua form giữ chỗ → reload → nhận sách bằng API staff → gia hạn bằng UI → tạo/hủy hàng chờ → trả bằng API staff. Hai bước dùng API trong bài này không được tính là kiểm thử giao diện quầy. Bài E2E chụp desktop/mobile để kiểm không tràn ngang.

Quầy và báo cáo: `StaffCirculationFlow` kiểm xác nhận, gửi kép, retry cùng nội dung, version, tài khoản bị khóa, lỗi 409 và giữ bộ lọc đã áp dụng khi tải CSV. `report-api.test` kiểm ngày nhuận/ngày sai, chuyển múi giờ, giới hạn 366 ngày và UUID. API client kiểm refresh khi tải binary, hủy request và response đến muộn sau đổi phiên. `InventoryCatalogIntegrationTest` kiểm mã vạch có ký tự SQL, phân biệt hoa thường, quyền hiện hành và GET không ghi. Bài E2E quầy riêng thực hiện mượn → reload → tra bản → gia hạn → nhận trả bằng UI, đối chiếu Loan/Copy trong Core và tải file CSV thật. Kết quả web và EXE phải ghi riêng theo đúng source; chưa có kiểm mở CSV bằng Excel hoặc đo tải production.

Pilot: `PilotAuthSecurityTest` kiểm PostgreSQL thật, CORS preflight, trusted Origin/header, cookie Secure/None và từ chối cấu hình cookie thiếu bảo vệ. `npm test` chạy thêm Node tests cho cấu hình build local/pilot/production, rồi Vitest cho URL, timeout, hủy request và phân loại lỗi mạng. `scripts/test-pilot-container.ps1` build image Core, kiểm readiness/user không phải root trong RAM 512 MiB và backup/restore dữ liệu đăng ký vào database mới trong container tạm. Đây là kiểm thử local, chưa thay cho TLS Neon/Render, giới hạn CPU cloud, cookie HTTPS trên WebView2 hoặc máy Windows thứ hai.
