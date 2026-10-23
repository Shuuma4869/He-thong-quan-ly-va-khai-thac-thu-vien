# Truy vết acceptance criteria và kiểm thử

Mã US/AC theo [User Stories](../01-yeu-cau/user-stories.md). Unit chỉ kiểm hàm/service với dependency giả; component test chạy React/router/query với network double; HTTP boundary của Insight có server thật nhưng DB/provider giả. PostgreSQL integration và Playwright API thật được ghi riêng. Có tên test trong bảng không đồng nghĩa toàn AC đã đạt.

| US / AC | Unit: rule/hàm cô lập | Database/service integration | Contract | Frontend component | E2E thật | Điều kiện còn thiếu |
|---|---|---|---|---|---|---|
| 01 / AC-01-01 | AuthServiceTest: normalize/READER/duplicate | AuthIntegrationTest.registrationPersistenceAndDuplicateConflict | Core OpenAPI | AuthFlow: đăng ký; xác nhận mật khẩu | Reader đăng ký/profile | Kết quả E2E commit cuối |
| 02 / AC-02-01 | AuthServiceTest: unknown/password/LOCKED | AuthIntegrationTest.loginMeRolesAndLockedAccount; refreshRotationReuseAndLogout | Core OpenAPI | AuthFlow login success/error/restore | Login staff/Reader + reload | Desktop commit cuối |
| 03 / AC-03-01 | AuthServiceTest: blank logout; client.test: late response/refresh | AuthIntegrationTest.refreshRotationReuseAndLogout; concurrentRefreshDoesNotProduceTwoValidRotations | Core OpenAPI | AuthFlow logout/reload; MemberFlow logout trong refresh | Reader logout/deep link | Access JWT có thể còn hạn, không claim revoke JWT |
| 04 / AC-04-01 | MemberServiceTest: principal/profile null/locked | MemberIntegrationTest.currentProfileUsesAuthenticatedPrincipalAndDoesNotWrite | MemberContractTest; Core OpenAPI | MemberFlow: ba role/profile/loading/error | Reader và staff profile | Chưa có PATCH profile, không test tính năng không tồn tại |
| 05 / AC-05-01 | MemberServiceTest: Reader denied/invalid size/filter/page; member-api.test | MemberIntegrationTest: listFiltersPaginatesAndValidatesSortAndStatus; current roles; SQL literal | MemberContractTest; Core OpenAPI | MemberFlow: URL/debounce/stale/403/empty | Staff tìm/lọc/sort/page/reload | Desktop commit cuối |
| 06 / AC-06-01 | catalog-api.test: query parser; CatalogTextTest | BookIntegrationTest; Phase2RegressionTest | Core OpenAPI | CatalogFlow: filter/page/stale/empty/error | Reader Catalog | UI không thay kiểm query DB |
| 07 / AC-07-01 | catalog-api.test: Book/Edition schema và resourcePath | EditionIntegrationTest | Core OpenAPI | CatalogFlow: hai Edition, không availability giả, 404 | Reader Book detail/reload | Schema unit không chứng minh FK; dùng DB test |
| 08 / AC-08-01 | catalog-api.test: Author UUID/recordLabel | AuthorIntegrationTest | Core OpenAPI | CatalogFlow: Author UUID; CatalogMedia fallback | Reader Author detail | Không tự tạo biography |
| 09 / AC-09-01 | CatalogTextTest; catalog-api.test: form validation | Author/Book/ReferenceCatalog/EditionIntegrationTest; Phase2RegressionTest rollback | Core OpenAPI | CatalogFlow: create/refetch/delete/FK | Staff CRUD danh mục | Unit không bao phủ mọi dòng service; transaction do integration kiểm |
| 10 / AC-10-01 | catalog-api.test: Copy payload version/form | InventoryCatalogIntegrationTest; Phase2RegressionTest locks | Core OpenAPI | CatalogFlow: Copy conflict, đổi Edition | Staff Inventory + stale 409 | Concurrency phải đọc kết quả PostgreSQL, không dùng UI test thay |
| 11 / AC-11-01 | metadata.spec; metadata-guard.spec | HTTP provider doubles trong unit; quyền thật qua E2E | Insight OpenAPI | CatalogMedia: metadata không ảnh/không ghi Core | Metadata quyền/live fallback | Không bảo đảm provider live luôn trả candidate; Google tắt |
| 12 / AC-12-01 | MediaInspectorTest: URL/MIME/size/redirect | MediaIntegrationTest | Core OpenAPI | CatalogMedia: duyệt, version409/license/fallback | Metadata + ảnh chưa duyệt | Quyền sử dụng asset cần căn cứ riêng |
| 13 / AC-13-01 | history.spec: save/get/replay/remove/error/DTO; metadata-guard: hai quota, reset/cap, thu hồi quyền | history.integration: fresh/upgrade/reconnect/owner/filter/sort/page; history-http.spec: 400/401/403/404/429/503 | Insight OpenAPI, Retry-After | MetadataHistory: empty/filter/save503/delete/replay/page/account switch; client.test late200/401 | History save/reload/cross-owner404/delete | Web/desktop đúng SHA cuối; policy retention đã viết, cần chốt và thực thi trước pilot |

## Cách xác nhận kết quả

| Phase 3 / AC | Backend PostgreSQL | Frontend/client | E2E thật | Giới hạn |
|---|---|---|---|---|
| 14-01 Favorites | FavoriteIntegrationTest: principal, duplicate, race, pagination, current role/status | LibraryFlow: pending/error/reload/account switch; library-api | Phase 3 save/reload/remove/My Library | Chưa kiểm trên máy Windows thứ hai |
| 15-01 Reviews | ReviewIntegrationTest + ReviewConcurrencyTest: owner/null/duplicate/FK/partial PATCH | LibraryFlow: owner control, lỗi giữ input, xác nhận, plain text; library-api | Phase 3 create/PATCH/delete, cross-owner403 | Cùng field vẫn last database write wins |
| 16-01 Rating | ReviewIntegrationTest: 1–5, average/count/rounding | LibraryFlow: keyboard 1/5, summary; library-api schema | Phase 3 điểm 1→5→xóa, average null/0 | Không thêm persistence rating thứ hai |

Core clean verify tại `ff054c4` đạt 121 test; đây là mốc backend, không thay frontend/EXE của commit mới. Các suite nêu trên phải chạy ở SHA bàn giao và đối chiếu CI/PR trước khi đóng Gate.

Snapshot đã xác minh ngày 23/10/2026: CI `39907400703` tại `ee929cd` đạt đủ năm job; local chạy `scripts/test-phase1-e2e.ps1 -Desktop` đạt 8/8 bài. Các yêu cầu “commit cuối” trong bảng là bước phải kiểm lại khi bàn giao một SHA mới, không còn là blocker Docker ở snapshot này. [Nguồn ảnh và kiểm EXE](../../ho-so-nop-bai/minh-chung-giao-dien/README.md) ghi môi trường, hash binary và giới hạn.

- Core: `./mvnw -B clean verify` trên Linux CI hoặc `mvnw.cmd -B clean verify` ở Windows có Docker. Unit AuthServiceTest/MemberServiceTest không khởi động Spring/PostgreSQL, không được dùng để thay full verify.
- Insight: `npm test`, `npm run test:integration`, `npm run build`. HTTP suite không dùng database thật; suite integration riêng không được skip khi thiếu Docker.
- Frontend: `npm run typecheck`, `npm test`, `npm run lint`, `npm run build`. Vitest gồm pure unit và component tests; không gọi tất cả là backend unit.
- Contract: `python scripts/validate-openapi.py` với dependency đã cài từ requirements.
- Web E2E: job `web-e2e` chạy `bash scripts/test-web-e2e-ci.sh` trên Linux; Windows dùng `scripts/test-phase1-e2e.ps1`. Cả hai dùng cùng `frontend/e2e/phase1.spec.ts`, không mock persistence.
- Desktop thật: `scripts/test-phase1-e2e.ps1 -Desktop` sau khi build EXE. CI Windows build/test Rust không thay WebView2 E2E.

Kết quả và SHA được gắn ở PR/CI; [gate](../../ho-so-nop-bai/doi-chieu-rubric.md) chỉ đóng khi các điều kiện bắt buộc đạt. Không copy test count từ một SHA cũ sang bản nộp mới. Mọi fixture chạy trên database tạm, không dùng dữ liệu người dùng thật.
