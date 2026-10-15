# Kiểm chứng Phase 1 — Auth và Member chỉ đọc

Ngày kiểm tra: 14/10/2026. Base: `main` tại `2717f87`, đã gồm [PR #5](https://github.com/Shuuma4869/He-thong-quan-ly-va-khai-thac-thu-vien/pull/5). Thay đổi thực hiện trên `Tuan/core-platform`; không sửa nhánh của Toan.

## Phạm vi

- Giữ Auth hiện có; bổ sung kiểm tra refresh/logout và sửa xử lý phiên ở frontend.
- Profile dùng `GET /api/v1/me/profile`, hỗ trợ READER/LIBRARIAN/ADMIN. `profile: null` là phản hồi hợp lệ, không phải lỗi thiếu dữ liệu cần tự tạo.
- Staff dùng `GET /api/v1/members`: tìm mã/họ tên, lọc trạng thái, phân trang và sắp xếp phía server. Danh sách không trả email hoặc vai trò.
- Không tạo bảng hồ sơ rỗng, không có migration mới, PATCH, form sửa hồ sơ hay tìm email. Những phần này không được tính là đã triển khai.

## Lỗi đã xác nhận và cách sửa

### Quyền truy cập danh sách sau khi tài khoản thay đổi

Trước bản sửa, `/members` chỉ kiểm role trong JWT. Integration test đã tái hiện tài khoản staff bị khóa nhưng token cũ vẫn nhận HTTP 200 thay vì 403. `MemberService` nay kiểm tra thêm trạng thái và vai trò hiện tại qua Identity trước khi truy vấn; controller truyền UUID từ authenticated principal. Tài khoản bị khóa/vô hiệu hóa hoặc mất role staff trả 403; chủ thể bị xóa trả 401. Giữ kiểm role JWT, nên tài khoản vừa được cấp quyền cần token mới.

`MemberIntegrationTest` bao phủ cả LIBRARIAN và ADMIN với thay đổi trạng thái, thu hồi quyền và xóa chủ thể. Đây là sửa lỗi authorization, không phải thêm nghiệp vụ quản trị tài khoản.

### Refresh và logout ở frontend

API client gom các yêu cầu refresh đồng thời, chỉ thử lại một lần và truyền AbortSignal. AuthProvider kiểm tra thế hệ phiên để phản hồi refresh đến muộn không khôi phục tài khoản đã đăng xuất. Khi đăng xuất, dữ liệu hiển thị/cache được xóa ngay; request logout chờ lượt rotation đang chạy rồi thu hồi cookie mới. Test bao phủ 401 muộn sau logout, 401 sau refresh, 403 không refresh và logout trong khi refresh đang chờ.

### Chạy local trên Windows

Java được gọi bằng đường dẫn JAR tương đối từ thư mục Core, tránh lỗi truy cập JAR với đường dẫn tuyệt đối chứa tiếng Việt. Script E2E dùng thống nhất `127.0.0.1` cho Vite, CORS và probe, tránh khác biệt phân giải IPv4/IPv6 của `localhost`.

### Giữ focus khi tìm kiếm

Lượt kiểm tra bổ sung đã tái hiện ô tìm kiếm mất focus sau debounce vì component bị remount theo URL. Component nay giữ nguyên và chỉ đồng bộ draft khi query trên URL đổi. Vitest và hai luồng staff E2E đều kiểm focus sau khi kết quả tìm kiếm về.

## Ma trận kiểm thử

| Nhóm | Phạm vi |
|---|---|
| Auth PostgreSQL | Đăng ký, lưu DB, trùng email, không tự nâng quyền, đăng nhập email/memberCode, trạng thái tài khoản, refresh rotation/reuse/logout và refresh đồng thời |
| Member PostgreSQL | Self theo principal, 401/403, token sai/hết hạn, role/status hiện tại, DTO allowlist, GET không ghi dữ liệu, search/filter/page/sort và validation |
| Truy vấn Member | Bind giá trị đầu vào; `%`, `_`, `\` là ký tự tìm kiếm literal; dấu nháy, chuỗi SQL injection, Unicode, thứ tự ổn định khi trùng tên và trang rất lớn |
| Contract | Hai endpoint GET, khai báo security, response 200/401/403, required fields và page envelope; không có alias members/me |
| Frontend | Profile ba role; loading/error/retry/null; list empty/403; debounce/stale response; URL/deep link; guard; refresh/logout |
| Browser thật | Reader đăng ký/xem hồ sơ/reload/bị chặn staff/logout; Librarian và Admin tìm/lọc/sort/phân trang/reload/Back/xem hồ sơ; viewport 390 và 1440 px |

## Kết quả chạy

Môi trường: Java 21.0.12, Node 22.23.3, npm 10.9.9, Maven Wrapper, Docker Desktop Linux và PostgreSQL 17.6 trong container riêng.

| Lệnh | Trạng thái ngày 14/10/2026 |
|---|---|
| `scripts/check-quality.ps1` | PASS lúc 20:27: Core 16/16, Insight 1/1, frontend 31/31, Prisma validate, typecheck/lint/build và Compose config |
| `cd frontend; npm run typecheck; npm run lint; npm test; npm run build` | PASS; 31/31 Vitest, không có lỗi lint/typecheck/build |
| `cd backend/insight-service; npm run prisma:validate; npm test; npm run build` | PASS; 1/1 Jest |
| `cd backend/core-service; .\mvnw.cmd -Dtest=MemberContractTest test` | PASS; 1/1 contract test |
| `scripts/test-phase1-e2e.ps1 -CorePort 19081 -FrontendPort 19174` | PASS 3/3 trên Chromium, lượt cuối lúc 20:32; kiểm ảnh mobile/desktop và dọn container tạm thành công |
| `cd frontend; npm audit --omit=dev` | 0 cảnh báo dependency runtime tại thời điểm kiểm tra |

Report máy sinh nằm trong `backend/core-service/target/surefire-reports`, `frontend/playwright-report` và `frontend/test-results` (không đưa lên Git). Log các process E2E ở `backend/core-service/target/e2e-runtime-*`.

Sau sửa focus, đã chạy lại typecheck/lint/Vitest/build frontend, PASS 31/31. Các lượt E2E trước đó thất bại vì launcher (đường dẫn JAR, địa chỉ probe, thiếu Chromium) và locator của select trong test; những lỗi này đã được sửa và chạy lại đầy đủ, không bỏ assertion hoặc tăng retry để che lỗi.

## Giới hạn và việc chưa làm

- Kết quả local không thay thế review và CI trên PR; chưa có quyền tự merge vào main.
- Chưa kiểm Firefox/WebKit, load test, triển khai production hoặc các phase ngoài Auth/Member.
- E2E hiện chạy riêng ở local; chưa được thêm vào workflow CI. Lỗi mạng và các race được kiểm bằng Vitest, không phải toàn bộ đều đã tái hiện trên trình duyệt thật.
- `npm audit` toàn bộ frontend còn 13 cảnh báo trong dependency phát triển (1 moderate, 10 high, 2 critical), liên quan tooling lint/test và dependency bắc cầu. Không dùng `--omit=dev` để kết luận toàn bộ dependency an toàn; không tự nâng Vitest major hoặc chạy audit fix force trong đợt này.
- Cần duyệt trường Member-specific và contract mới trước khi làm sửa hồ sơ, model và migration. Các task đó vẫn deferred, không đánh dấu DONE.
