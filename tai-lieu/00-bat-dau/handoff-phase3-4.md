# Bàn giao Phase 3 và điều kiện bắt đầu Phase 4

## Điều kiện chung

Phase 2.5 đã tích hợp qua PR #12 tại `b9cf5f3898e92c0b1420c9d031275e8066f1ba20`; CI main `39985051027` đạt năm job. Nhánh DEV1 là `Tuan/core-platform`, PR trực tiếp vào main, giữ nguyên `Toan/common-modules`. Trước mỗi lần tích hợp phải kiểm lại GitHub; SHA trong tài liệu là mốc truy vết, không thay trạng thái hiện tại.

## Phase 3 — Toan

PR #11, head f4dcbcb4597a0151e8f55611d627e92be045ddc8, merge b8e7bc616d72b608acdb91a43965484e39dfa6ce. Backend P3-D2-01 Favorites, P3-D2-02 Reviews, P3-D2-03 Rating do Toan triển khai. DEV1 review và sửa tích hợp trên nhánh của mình, không sửa lịch sử hoặc nhánh Toan.

- Contract: Core OpenAPI favorites/reviews/rating; V14 favorites, V15 reviews; unique user-book; rating 1–5; favorites cascade, reviews restrict.
- Tests hiện có: FavoriteIntegrationTest, ReviewIntegrationTest, ReviewConcurrencyTest, Phase3MigrationTest, Catalog regression.
- Chạy lại Maven clean verify trên SHA bàn giao với PostgreSQL, fresh và upgrade V13.
- Câu hỏi review: hai PATCH đồng thời sửa body/rating có mất cập nhật? Patch null/empty thế nào? Xóa review cuối aggregate null/count 0 có nhất quán? Role bị revoke/LOCKED có chặn mọi mutation? Query/tie-break và DTO có rò userId? Cạnh tranh Book delete/create trả lỗi gì?
- Đã tái hiện trên PostgreSQL và sửa: hai PATCH khác field ghi đè nhau, null tường minh không đúng contract và lỗi FK khi Book bị xóa trong lúc INSERT. Test phối hợp hai transaction, không dùng sleep ngẫu nhiên. UPDATE chỉ sửa field được gửi; cùng field theo lần ghi database sau thắng. Xem [cơ chế và giới hạn](../02-kien-truc/favorites-reviews.md).
- Staff không có quyền moderation ngầm. DEV1 bổ sung GET `/me/favorites/{bookId}` và GET `/me/reviews` cho UI; không thêm migration, không chuyển dữ liệu sang Insight.

## Phase 3 — Tuan

PR #13 đã merge tại `ea93b7ae301389aae983314db56dea9fdb27869c` ngày 24/10/2026 (Asia/Saigon). Head trước merge `6598dd3` đạt CI 5/5 tại run `40010074211`; [minh chứng desktop](../../ho-so-nop-bai/minh-chung-giao-dien/README.md) phân biệt checkout, binary và ảnh. Nhánh Tuan đã fast-forward tới commit merge; nhánh Toan không thay đổi. CI main `40011636146` đạt đủ năm job, đóng Integration Gate Phase 3.

P3-D1-01 Favorites UI phụ thuộc D2-01; D1-02 ReviewSection trong BookDetail phụ thuộc D2-02; D1-03 RatingInput phụ thuộc D1-02/D2-03; D1-04 MyLibrary/Profile integration sau Favorites/Reviews.

| Task | File thực thi | Đầu ra |
|---|---|---|
| P3-D1-01 | features/favorites/FavoriteButton.tsx; features/my-library/MyLibraryPage.tsx | Lưu/bỏ yêu thích ở BookDetail và danh sách cá nhân; không có FavoritesPage riêng |
| P3-D1-02 | features/reviews/ReviewSection.tsx | Tạo/sửa/xóa, phân trang, xác nhận xóa, lỗi giữ input; chỉ PATCH field đổi |
| P3-D1-03 | features/reviews/RatingInput.tsx | Radio 1–5 dùng bàn phím, summary từ Core; rating nằm trong review |
| P3-D1-04 | features/my-library/MyLibraryPage.tsx; ProfilePage; ReaderLayout; AppRouter | `/thu-vien-cua-toi`, hai danh sách độc lập, cache và remount theo user |

Đường dẫn frontend tính từ `frontend/src`. Shared client kiểm session generation; logout xóa cache. Không optimistic mutation, chỉ báo thành công sau response server. Timeout sau commit cần tải lại, không tự gửi POST lặp. LibraryFlow và library-api kiểm component/client; E2E Phase 3 kiểm persistence, reload, đổi tài khoản và 403 cross-owner với API/PostgreSQL thật.

Implementation chưa tự động có nghĩa TESTED hoặc INTEGRATED. Gate cần Core clean verify, Insight/Prisma, frontend typecheck/lint/test/build, OpenAPI, web E2E, Rust/Tauri, EXE mới build và CI năm job đúng SHA. Không dùng ảnh/binary `ee929cd` thay bằng chứng Phase 3. Kết quả chạy và merge của bản bàn giao xem PR/CI; Academic Final Gate vẫn cần xác nhận học phần bên ngoài repository.

## Phase 4 — Tuan

V16 `loans` và policy đã tích hợp qua PR #14, merge `bc5151039efd4826e9eb03dc52ac1f991999e5c7`; CI main `40041476883` đạt 5/5. V17 tích hợp qua PR #15, merge `594efbee69ae114b2a49f175252e7237f8ea471a`; CI main `40062526536` đạt 5/5. PR #16 thêm giữ chỗ/gia hạn V18, merge `be3f18c0809a8de0e3ef08703f20792721e5250a`; head `f8b308d` đạt CI `40083737232` 5/5 và EXE mới build đạt 9/9 hồi quy. CI của merge main kiểm riêng tại run `40084534697`, không suy từ kết quả head. P4-D1-02 dùng giá trị phát triển PROVISIONAL; chưa coi toàn bộ Phase 4 hoàn thành từ mốc command này.

| Task | Output hiện có hoặc đang chờ | Kiểm chứng / điều kiện nối tiếp |
|---|---|---|
| P4-D1-01 | V16, `Loan`, `LoanRepository` | `LoanSchemaTest`, `LoanRepositoryIntegrationTest`; unique active Copy, FK, upgrade V15, transaction |
| P4-D1-02 | `CirculationPolicy`, `BorrowPolicyService`; cấu hình môi trường | `BorrowPolicyTest`; quota/status/role/overdue, cấu hình sai dừng khởi động; command phải khóa Reader trước khi đếm |
| P4-D1-03/04/06/07/08 | Borrow/Return, CopyLockRepository/CopyStateService, receipt V17, audit/outbox; Return nối phân bổ Hold | LoanCommandIntegrationTest và HoldIntegrationTest kiểm quyền, replay, rollback, quota/copy race, return/cancel |
| P4-D1-05 | LoanRenewalService, `/loans/{id}/renew`, audit V18 | Chặn quá hạn/hết lượt/WAITING phù hợp; cạnh tranh renew/return, snapshot policy gia hạn riêng |
| P4-D1-09..12 | Hold V18, tạo/hủy/nhận, FIFO theo chi nhánh/Edition, allocation/expiry, query riêng tư | HoldIntegrationTest, LoanSchemaTest; không đồng nghĩa giao diện đã hoàn thành |
| P4-D1-13 | HoldEtaService/HoldEtaModel và nút tính ETA trong thẻ WAITING | Mô phỏng có điều kiện theo Edition/Branch, dueAt và chu kỳ pickup/mượn; từ chối ngày khi quá hạn/thiếu nguồn lực/scope lớn; HoldEtaModelTest, HoldEtaIntegrationTest, HoldEstimate và E2E Reader |
| P4-D1-14 | OutboxPublisher/Repository/Job, V19; opt-in, retry và ACK trong transaction riêng | OutboxPublisherIntegrationTest với PostgreSQL/Kafka thật, lỗi DB sau ACK, worker cạnh tranh; OutboxMigrationTest nâng V18. Chờ gate của commit bàn giao |
| P4-D1-15 | Consumer thông báo chưa có | Cần dedup bền vững, out-of-order, retry/DLQ và replay; publisher riêng chưa phải pipeline hoàn chỉnh |
| P4-D1-16 | ReaderLoansPage/HoldCreatePage: xem Loan/Hold, giữ đúng ấn bản hoặc chọn bất kỳ, gia hạn/hủy có xác nhận | CirculationFlow kiểm retry cùng requestId, chặn double submit, lỗi và query; E2E Reader lưu thông cần đối chiếu CI/EXE đúng SHA |
| P4-D1-17 | StaffCirculationPage/MemberPicker: tìm người, quét mã, xác nhận mượn/trả/gia hạn, lịch sử theo người/chi nhánh/bản | StaffCirculationFlow kiểm xác nhận, version, retry, lỗi và bộ lọc; E2E quầy thực hiện command bằng UI rồi kiểm dữ liệu Core |
| P4-D2-01..02 | LoanHistoryController/Service/Repository; `/me/loans`, `/loans`, `/loans/{id}` | Owner/current-role, filter borrowedAt/status/branch/copy, phân trang, giữ Edition/Branch lịch sử |
| P4-D2-03..04 | CirculationReportService/LoanCsvExporter và CirculationReportPage; `/reports/circulation(.csv)` | Nhóm Loan bắt đầu trong [from,to), hiện trạng tại asOf; timezone, 366 ngày/10000 nhóm; tải CSV có xác thực, không chứa danh tính người mượn |
| P4-D2-05 | LoanHistoryIntegrationTest và LoanCsvExporterTest | PostgreSQL/HTTP, bộ lọc lỗi, quyền, biên thời gian, CSV/formula và GET không ghi; kiểm CI đúng SHA trước khi đánh dấu tích hợp |

Chi tiết schema, cấu hình, retention và ranh giới kiểm thử ở [kiến trúc lưu thông](../02-kien-truc/circulation.md). Tất cả đường dẫn Java trong bảng tính từ package Core. Bảng này không đánh dấu cả Phase 4 hoàn thành.

P4-D2-01..05 đã tích hợp qua PR #17 tại `d704b0c5459e7e5529ccef883df6846f7d149f1a`; head `236871c` đạt CI `40084875776` 5/5, Core 205 test và hồi quy EXE 9/9 với binary `f8b308d` vì frontend chưa đổi. CI main kiểm riêng tại `40119301261`. Các kết quả này không thay cho Reader UI được bổ sung sau PR #17.

Reader UI tích hợp qua PR #18 tại `c748a009dc1b8d333fe3065e2498aac85ec25a65`. Head `7ea5463` đạt CI `40124723019` 5/5 và EXE 10/10 với frontend cùng source. Bằng chứng này chưa bao gồm quầy và báo cáo UI bổ sung sau đó; các lượt kiểm của giao diện mới phải đối chiếu theo head/CI riêng.

Quầy mượn trả và báo cáo UI tích hợp qua PR #19 tại `2a52628d1f3d85eef23fdea7756c8fbf7273adbe`. Head `ff2c469` đạt CI `40142240799` 5/5, Core 208 test và EXE 11/11, gồm tải CSV và reload ứng dụng sau tải. CI main sau merge `40146844000` đạt 5/5. Bản EXE này chưa có ETA; kiểm chứng ETA phải dùng bản build và lượt chạy mới.

ETA tích hợp qua PR #20 tại `bffa90d40c5e318de48a6eb0f8b881803a096c98`. Head `a42367b` đạt CI `40147032938` 5/5, Core 220 test, frontend 137 Vitest + 4 test cấu hình và EXE mới 11/11; SHA256 EXE `F0B4372DBD5FA946060BB28DF8BCF8D5DE6348D0BD9FFAFF61BE77BFAD54423C`. Đây là bằng chứng luồng tính có điều kiện và hồi quy chức năng, chưa phải đánh giá sai số dự báo trên dữ liệu vận hành. Theo dõi CI merge main riêng trước lần tích hợp tiếp theo.

Phân công gốc vẫn giữ để truy vết tác giả. Quyết định ngày 24/10/2026 mở rộng triển khai trên nhánh Tuan tới phần còn thiếu của cả hai thành viên trong Phase 4–6, gồm P4-D2-01..05 (query/filter/report/CSV/tests). Không sửa nhánh Toan, không gán code gốc của Toan cho Tuan, không đánh dấu các task mới DONE trước khi có đầu ra và kiểm chứng.

Điều kiện bắt đầu: Phase 3 contract/tests/main gate đã đạt, DEV1 duyệt policy quota/due date/renew/hold priority, migration number được đăng ký. Bảo toàn Book != Edition != Copy; transaction nghiệp vụ ở Core; unique một active loan/copy; không fake availability; event chỉ publish qua outbox sau khi thực sự triển khai. Không cho Insight viết bảng Core. Concurrency cần PostgreSQL tests phối hợp transaction, không chỉ sleep.

Policy cấu hình dùng mặc định PROVISIONAL phải ghi rõ; quyết định làm đổi nghiệp vụ hoặc quyền không thể đảo ngược cần xác nhận. UI lưu thông sẽ nối query thật sau command, không tạo API giả hoặc dữ liệu Loan/Hold mẫu trong production. Phase 5 đã chốt sáu loại bất thường: WRONG_SHELF, EXPECTED_BUT_MISSING, STATUS_MISMATCH, WRONG_BRANCH, UNKNOWN_BARCODE, DUPLICATE_SCAN; sửa dữ liệu phải có nhân viên xác nhận và kiểm version. Quyết định này không phải bằng chứng đã triển khai kiểm kê.
