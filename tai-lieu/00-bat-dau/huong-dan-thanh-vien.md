# Hướng dẫn thành viên và phạm vi công việc

## Cách phối hợp

Tuan làm trên `Tuan/core-platform`; Toan làm trên `Toan/common-modules`. Mỗi nhánh mở PR trực tiếp vào `main`, chờ review và CI; không có bước tích hợp qua develop. Không tự merge khi chưa được duyệt. Trước task: kiểm working tree, fetch, xem commit graph rồi đồng bộ main bằng cách bảo toàn thay đổi local; không force-push/reset hoặc đưa commit chưa merge của người khác vào nhánh mình.

Tuan sở hữu UI/desktop, Identity/Auth, shared infrastructure/CI và các nghiệp vụ giao dịch/phân tích được giao. Toan sở hữu Member backend và các module thông thường theo roadmap. Khi sửa phần người khác: phải có lỗi hoặc contract mismatch tái hiện được, bản sửa nhỏ, test regression và nêu trong PR. Không viết lại module chỉ để đổi phong cách.

## Phase 1: đầu ra và điều kiện nghiệm thu

Phạm vi Member được chốt qua PR #5: hai API GET, không tìm email, không tạo member_profiles/model rỗng và chưa có PATCH. Identity tiếp tục sở hữu tài khoản/role/token. `profile: null` là đúng contract. Các task deferred không là prerequisite của baseline read-only và không được đánh dấu đã triển khai.

Đường dẫn `identity/...` dưới đây nằm trong `backend/core-service/src/main/java/io/github/shuuma4869/lams/core/`. Test Java nằm cạnh module tương ứng trong `src/test/java`.

| Task | Owner | Output/DoD | File chính | Kiểm tra bắt buộc | Dependency | Phạm vi |
|---|---|---|---|---|---|---|
| P1-D1-01 | Tuan | Đăng ký chỉ READER; đăng nhập email/memberCode; access JWT, refresh rotation/reuse, logout và auth/me. | identity/api/AuthController.java; identity/application/AuthService.java | AuthIntegrationTest | P0-D1-01 | Baseline đã có implementation; nghiệm thu bằng test và review |
| P1-D1-02 | Tuan | Đăng nhập/đăng ký/đăng xuất thật; access token trong bộ nhớ; refresh cookie; không phục hồi phiên sau logout. | frontend/src/features/auth/; frontend/src/shared/api/client.ts | AuthFlow.test.tsx; client.test.ts | P1-D1-01 | Baseline đã có implementation; nghiệm thu bằng test và review |
| P1-D1-03 | Tuan | Kiểm cả success/error/role/status, refresh đồng thời và logout; không suy PASS từ mock sang API thật. | AuthIntegrationTest.java; frontend/src/features/auth/AuthFlow.test.tsx | AuthIntegrationTest; AuthFlow; E2E Reader | P1-D1-01, P1-D1-02 | Baseline đã có implementation; nghiệm thu bằng test và review |
| P1-D2-01 | Toan | Chốt read-only theo PR #5: self principal, profile null, staff list chỉ mã/tên/status; không tạo bảng rỗng. | tai-lieu/05-api-va-event/member-contract.md; contracts/openapi/core-api.yaml | MemberContractTest | P1-D1-01 | Baseline đã có implementation; nghiệm thu bằng test và review |
| P1-D2-02 | Toan | Chỉ thiết kế migration khi có field Member-specific được duyệt; không sửa V1/V2 hoặc sao chép Identity. | Không tạo trong baseline | Sau mở scope: fresh DB, FK/constraints/persistence | P1-D2-01 | Hoãn, chưa triển khai |
| P1-D2-03 | Toan | Đọc projection Identity; bind query, escape wildcard, allowlist sort, UUID tie-break; không N+1. | identity/member/infrastructure/MemberRepository.java | MemberIntegrationTest: query/filter/page/sort | P1-D2-01 | Baseline đã có implementation; nghiệm thu bằng test và review |
| P1-D2-04 | Toan | Self kiểm ACTIVE; list kiểm quyền JWT và trạng thái/role hiện tại trong DB; DTO read-only. | identity/member/application/MemberService.java | MemberIntegrationTest: currentProfile; staffListRechecksActiveStatusAndCurrentRolesInsteadOfTrustingOldJwt | P1-D2-03 | Baseline đã có implementation; nghiệm thu bằng test và review |
| P1-D2-05 | Toan | GET /api/v1/me/profile lấy UUID từ principal; 401/403 đúng, DTO allowlist, profile null; GET không ghi DB. | identity/member/api/CurrentMemberController.java | MemberIntegrationTest: self/principal/readonly | P1-D2-04 | Baseline đã có implementation; nghiệm thu bằng test và review |
| P1-D2-06 | Toan | GET /api/v1/members chỉ LIBRARIAN/ADMIN ACTIVE còn quyền; không email/role/token trong items. | identity/member/api/MemberAdminController.java | MemberIntegrationTest: staff-only, revoked role/status | P1-D2-04 | Baseline đã có implementation; nghiệm thu bằng test và review |
| P1-D2-07 | Toan | Query mã/tên ≤150, status 3 giá trị; page≥0, size1–100; sort mã/tên asc/desc; không email search. | identity/member/infrastructure/MemberRepository.java; identity/member/application/MemberService.java | MemberIntegrationTest: SQL literal/injection, stable pages, 422 | P1-D2-06 | Baseline đã có implementation; nghiệm thu bằng test và review |
| P1-D2-08 | Toan | Chờ field, kiểu, validation, quyền và retention được duyệt; không dùng fullName/email để lấp form. | Không tạo trong baseline | Sau mở scope: owner update/read-back, cross-user 403, 422, rollback | P1-D2-01 | Hoãn, chưa triển khai |
| P1-D2-09 | Toan | Kiểm PostgreSQL thật; auth/status/role/DTO/query/readonly, không H2 và không bỏ test khi thiếu Docker. | backend/core-service/src/test/java/io/github/shuuma4869/lams/core/identity/member/MemberIntegrationTest.java | mvnw test; MemberIntegrationTest | P1-D2-05, P1-D2-07, P1-D2-12, P1-D2-13 | Baseline đã có implementation; nghiệm thu bằng test và review |
| P1-D2-10 | Toan | Contract, DTO, quyền, lỗi, params và giới hạn khớp code; frontend có thể tích hợp không đoán schema. | tai-lieu/05-api-va-event/member-contract.md; contracts/openapi/core-api.yaml | MemberContractTest; API integration | P1-D2-09 | Baseline đã có implementation; nghiệm thu bằng test và review |
| P1-D2-11 | Toan | Model persistence chỉ bổ sung cùng field/migration được duyệt; record DTO không thay cho entity có persistence. | Không tạo trong baseline | Sau mở scope: mapping/schema/persistence | P1-D2-02 | Hoãn, chưa triển khai |
| P1-D2-12 | Toan | Chặn anonymous/Reader staff, token sai/hết hạn, tài khoản bị khóa hoặc mất role; self không đổi scope bằng userId. | identity/member/api/; identity/member/application/MemberService.java | MemberIntegrationTest: 401/403/expired/locked/revoked | P1-D2-04 | Baseline đã có implementation; nghiệm thu bằng test và review |
| P1-D2-13 | Toan | Query/page/size/sort/status không hợp lệ trả 422; không lỗi SQL/stacktrace; DTO chỉ field cho phép. | identity/member/application/MemberService.java; contracts/openapi/core-api.yaml | MemberIntegrationTest; MemberContractTest | P1-D2-06 | Baseline đã có implementation; nghiệm thu bằng test và review |
| P1-D1-04 | Tuan | Profile read-only cả ba role; API thật, loading/error/retry, profile null; responsive, không nút lưu giả. | frontend/src/features/profile/ProfilePage.tsx | MemberFlow.test.tsx; E2E Profile | P1-D2-10 | Baseline đã có implementation; nghiệm thu bằng test và review |
| P1-D1-05 | Tuan | Chỉ làm khi PATCH/field hợp lệ đã bàn giao; không tự thêm phone/address/avatar hoặc sửa Identity qua Member. | Không tạo trong baseline | Sau mở scope: validation, update/read-back, 401/403/422 | P1-D2-08 | Hoãn, chưa triển khai |
| P1-D1-06 | Tuan | List từ API; page envelope/tổng thực, loading/error/empty/retry, không lọc dữ liệu toàn bộ ở client. | frontend/src/features/members/MemberListPage.tsx; frontend/src/features/members/member-api.ts | MemberFlow; member-api.test; E2E staff | P1-D2-10 | Baseline đã có implementation; nghiệm thu bằng test và review |
| P1-D1-07 | Tuan | Debounce, giữ focus, reset page, status/sort, URL reload/Back; hủy response cũ. | frontend/src/features/members/MemberSearch.tsx | MemberFlow: debounce/stale/URL; E2E staff | P1-D1-06 | Baseline đã có implementation; nghiệm thu bằng test và review |
| P1-D1-08 | Tuan | Profile yêu cầu login; staff list guard/menu đúng role; deep link, anonymous redirect, Reader forbidden. | frontend/src/app/router/AppRouter.tsx; frontend/src/app/layouts/ | MemberFlow guard; E2E ba role | P1-D1-04, P1-D1-06 | Baseline đã có implementation; nghiệm thu bằng test và review |
| P1-D1-09 | Tuan | Kiểm API parser, state, 401/403, role, race, responsive và API thật; E2E không thay bằng mock runtime. | frontend/src/features/members/MemberFlow.test.tsx; frontend/e2e/phase1.spec.ts | Typecheck/lint/Vitest/build; scripts/test-phase1-e2e.ps1 | P1-D1-04, P1-D1-07, P1-D1-08 | Baseline đã có implementation; nghiệm thu bằng test và review |

Kết quả kiểm thử từng commit xem tại CI và PR, không lưu báo cáo audit theo ngày trong source. `MemberContractTest` chỉ kiểm cấu trúc Member liên quan, không thay cho kiểm định toàn bộ OpenAPI.

## Chuyển sang desktop Windows

Tuan phụ trách đóng gói React bằng Tauri/WebView2, script môi trường/chạy/build và kiểm thử cửa sổ thật. Core/Nest/PostgreSQL giữ ownership hiện tại; Tauri không tự mở database hoặc thực hiện nghiệp vụ thay backend. Toan không phải tạo backend mới cho desktop.

Toàn bộ roadmap sản phẩm Windows/cloud thuộc Tuan: API/session triển khai, cloud pilot, server/database, HTTPS, secrets, backup/restore, installer, updater/signing, CI/CD, release, giám sát, rollback và kiểm thử máy Windows khác. Toan chỉ làm module nghiệp vụ và regression/QA module đã được giao; không nhận thêm nhiệm vụ triển khai server, review Tauri hay QA bộ cài.

Output: thành viên clone đúng nhánh, cài prerequisite theo [chạy desktop](../08-van-hanh/desktop-windows.md), khởi động dịch vụ và mở cửa sổ LAMS bằng lệnh; build tạo EXE/installer. Kiểm cả auth cookie/reload/logout, Profile, staff role/list và các lỗi backend không sẵn sàng. Build thành công chưa đủ để nghiệm thu desktop.

## Phase 2: đầu ra triển khai và nghiệm thu

Catalog/Inventory gốc thuộc Toan. Tuan tiếp nhận sửa lỗi tích hợp trên `Tuan/core-platform` theo thống nhất: không push nhánh Toan, không merge PR còn lỗi chỉ vì CI xanh. Bảng dưới là đường dẫn implementation hiện có, không phải xác nhận đã merge. Trạng thái nghiệm thu của từng commit phải đối chiếu PR, review và CI; không tạo lại các file này từ tên dự kiến trong kế hoạch cũ.

Đường dẫn Core tương đối với `backend/core-service/src/main/java/io/github/shuuma4869/lams/core/`; frontend tương đối với `frontend/src/`; Insight tương đối với `backend/insight-service/src/discovery/metadata/`.

| Task | Output và file chính | Kiểm chứng bắt buộc |
|---|---|---|
| P2-D2-01 | Author CRUD: `catalog/author/`; Reader được GET, staff được ghi | AuthorIntegrationTest; Phase2RegressionTest: role hiện tại/401/403/404/422/FK |
| P2-D2-02 | Category CRUD: `catalog/category/`; NFKC + Unicode whitespace; unique key | ReferenceCatalogIntegrationTest; CatalogTextTest; CatalogMigrationTest: V11/409/collision |
| P2-D2-03 | Publisher CRUD: `catalog/publisher/`; không tự ép tên unique | ReferenceCatalogIntegrationTest; Phase2RegressionTest: Reader GET, Edition FK |
| P2-D2-04 | Book và bảng nối: `catalog/book/`; filter/count cùng điều kiện, query bind, transaction | BookIntegrationTest; Phase2RegressionTest: rollback, wildcard, author/category, page |
| P2-D2-05 | Edition thuộc Book: `catalog/edition/`; ISBN nullable, Publisher FK | EditionIntegrationTest; E2E nhiều ấn bản, 404/422/xóa đang tham chiếu |
| P2-D2-06 | Branch: `inventory/branch/`; mã unique, ACTIVE/DISABLED | InventoryCatalogIntegrationTest; E2E staff CRUD |
| P2-D2-07 | Shelf: `inventory/shelf/`; khóa trước chuyển branch/kiểm Copy | InventoryCatalogIntegrationTest; Phase2RegressionTest: hai thứ tự khóa PostgreSQL |
| P2-D2-08 | Copy: `inventory/copy/`; barcode unique, PATCH bắt buộc version, không sửa circulation status | InventoryCatalogIntegrationTest; Phase2RegressionTest; E2E stale version 409 |
| P2-D2-09 | Test thật trong `backend/core-service/src/test/java/`; V3–V13, upgrade Unicode/revision media | Maven clean verify với PostgreSQL, không H2; không skip Docker test |
| P2-D2-10 | `contracts/openapi/core-api.yaml`, Catalog contract, ERD/data dictionary | OpenAPI validator; integration response; UI/API E2E |
| P2-D1-01 | Route/layout: `app/router/AppRouter.tsx`, `features/catalog/CatalogPage.tsx` | CatalogFlow: guard/loading/error/empty; E2E responsive/reload |
| P2-D1-02 | Book list phân trang Core: `features/catalog/BookList.tsx`, `catalog-api.ts` | catalog-api/CatalogFlow; E2E page/empty |
| P2-D1-03 | Query/Author/Category theo URL: `features/catalog/BookFilters.tsx` | debounce/cancel/URL/Back/reset page; E2E filter server |
| P2-D1-04 | `features/catalog/BookDetailPage.tsx`: Book + Edition, ảnh đã duyệt/fallback | CatalogFlow; E2E nhiều Edition/404/reload; không hiển thị availability giả |
| P2-D1-05 | `features/catalog/AuthorDetailPage.tsx`: tác giả và Book theo UUID | CatalogFlow; E2E Author detail/filter |
| P2-D1-06 | Quản trị tám loại dữ liệu theo API: `features/catalog/StaffCatalogPage.tsx`, `CatalogForm.tsx`, `ReferencePicker.tsx`; không thêm xóa Branch/Shelf/Copy ngoài contract | validation/409/422/FK/version, Reader bị chặn; E2E ghi và đọc lại |
| P2-D1-07 | Provider boundary: `metadata.module.ts`, `metadata.service.ts`, `provider-http.service.ts`, `metadata.guard.ts` | Core auth/me/current role, timeout/cache/rate limit/no redirect; không ghi Catalog |
| P2-D1-08 | `open-library.service.ts`: ISBN-13 chính xác, provenance; nâng HTTP page link chính chủ sang HTTPS | metadata.spec: match/mismatch/unsafe URL/timeout/not-found; tra cứu live khi mạng cho phép |
| P2-D1-09 | `google-books.service.ts`: fallback bổ sung, không ghi đè; mặc định tắt | metadata.spec: config/fallback/ambiguity; chưa coi adapter test là nghiệm thu Google live |
| P2-D1-10 | `wikimedia.service.ts`: OL Author → Wikidata → Commons, đối chiếu định danh hai chiều | metadata.spec: nhầm định danh/thiếu license/attribution; không tìm ảnh bằng tên tương tự |
| P2-D1-11 | `media-normalizer.service.ts`; Core `catalog/media/`; frontend `CatalogMedia.tsx`, `MediaEditor.tsx` | MediaInspectorTest/MediaIntegrationTest/CatalogMedia: MIME/size/timeout/provenance/duyệt thủ công/version |
| P2-D1-12 | CatalogFlow/CatalogMedia, Insight metadata tests; `frontend/e2e/phase1.spec.ts` | typecheck/lint/test/build; OpenAPI; E2E web + EXE/WebView2; Rust fmt/test/clippy và Windows CI |

Quyết định phạm vi thay cho tên file/schema dự kiến: Book Detail chỉ hiện Edition và dữ liệu Core cho phép Reader đọc, không mở Inventory cho Reader hoặc suy diễn số bản có thể mượn. Metadata chỉ tra ISBN chính xác/định danh tác giả, chưa tìm gần đúng theo tên. Core lưu tham chiếu ảnh duyệt thủ công cho Edition/Author tại V12, không tải ảnh về MinIO hoặc tự ghi đè tên sách/tác giả. Google Books cần opt-in và API key phía server; thiếu điều kiện thì giữ tắt. Xem [kiến trúc](../02-kien-truc/catalog-media.md) và [chiến lược media](../03-du-lieu/media-strategy.md).

Điều kiện chốt Phase 2: các nhóm kiểm thử trên đạt cho commit bàn giao, tài liệu khớp code, PR được review hợp lệ, CI xanh và merge vào main không bypass. Cloud pilot/Google live/máy Windows thứ hai chưa được nghiệm thu không được ghi thành đã chạy. Không bắt đầu Phase 3 trước khi hoàn tất gate Phase 2.

## Phase 2.5: bổ sung nghiệp vụ Insight và hồ sơ học phần

Tuan triển khai history ISBN trong Nest/Prisma/PostgreSQL Insight, UI React-Bootstrap, contract/test và hồ sơ. Không chuyển Auth/Catalog/Favorites/Reviews sang Nest, không đổi task của Toan. Đầu ra gồm migration mới, các API owner-only, UI lưu/lọc/replay/xóa, kiểm PostgreSQL/E2E, 13 stories/AC, UML/wireframe và matrix Q1–Q10. Trạng thái nghiệm thu lấy từ [rubric/gate](../../ho-so-nop-bai/doi-chieu-rubric.md), không suy DONE từ việc có đủ file.

PR #11 đã đưa backend Phase 3 vào main; điều này không có nghĩa UI hoặc review concurrency đã hoàn thành. [Handoff Phase 3/4](handoff-phase3-4.md) giữ nguyên ownership và dependency. Phase 2.5 không bắt đầu triển khai UI My Library hay circulation.

## Các phase tiếp theo

| Phase | Tuan | Toan | Điều kiện trước khi làm |
|---|---|---|---|
| 2 Catalog/Inventory | Giao diện tra cứu/chi tiết/staff; tích hợp metadata và nguồn ảnh | Catalog/Inventory CRUD/read | Duyệt Book–Edition–Copy, schema, DTO, quyền và provenance ảnh |
| 3 My Library | Favorites/reviews/rating UI | API favorites/reviews/rating | Chốt rule user–book, quyền, validation và unique constraint |
| 4 Circulation/Hold | Borrow/return/renew, locking, hold/outbox và UI | Loan history/read/report | Chốt policy/transaction/concurrency; đọc không sửa command-side |
| 5 Kiểm kê | Snapshot/scan/anomaly/reconciliation/UI | Query dữ liệu phục vụ kiểm kê | Duyệt anomaly/policy, idempotency và scope |
| 6 Search | FTS/trigram/ranking/vector khi được duyệt, UI/cache | Taxonomy/alias | Benchmark và contract; không bật vector chỉ vì có extension |
| 7 Acquisition | Demand/scoring/guardrail/review/dashboard | Read report/CSV | Có score version/evidence, không tự đặt mua |
| 8 Release | Regression/E2E/security/load/CI/vận hành | Module regression và hướng dẫn | Có nghiệp vụ thật; không gọi kế hoạch là đã triển khai |

## Quy tắc giữ tài liệu

Giữ yêu cầu, kiến trúc/ADR, ERD/data dictionary, thuật toán, API/event contract, UI specification, kế hoạch/ownership/DoD, runbook và kịch bản demo. Đây là nguồn để thành viên hiểu dự án và làm slide/báo cáo.

Không lưu bản nháp commit/PR/merge, audit theo lần chạy, baseline/result JSON hoặc nhật ký hội thoại vào dự án. Kết quả CI ở GitHub; report máy sinh chỉ là artifact bỏ qua bởi Git và có thể dọn sau kiểm thử. Không xóa tài liệu kỹ thuật chỉ vì tên có từ “audit” nếu nó mô tả nghiệp vụ kiểm kê thực sự.

Tài liệu local-only `huong-dan-thanh-vien/` không tự đưa lên GitHub. Hướng dẫn chia sẻ ở `tai-lieu/` phải đủ để thành viên clone dự án chạy và hiểu phạm vi mà không cần các bản audit riêng.
