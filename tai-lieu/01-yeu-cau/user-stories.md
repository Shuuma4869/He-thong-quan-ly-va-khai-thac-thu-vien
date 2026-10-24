# User Stories và truy vết phạm vi học phần

Nhóm hai thành viên; US-01–16 bao gồm UI Phase 3, US-17–20 bổ sung backend lưu thông/giữ chỗ; tình trạng kiểm thử/tích hợp phải đối chiếu từng SHA. API ở bảng tính từ `/api/v1`; tên test chỉ là vị trí kiểm chứng, không tự đồng nghĩa PASS. Evidence của release phải gắn SHA và CI; E2E cần kết quả riêng. Priority P1 trừ US-08/11/12 là P2.

## Stories và acceptance criteria

### US-01

Là người đọc mới, tôi muốn đăng ký tài khoản để sử dụng dịch vụ thư viện.

- AC-01-01: Đăng ký hợp lệ tạo READER; email trùng trả 409; dữ liệu sai bị chặn.
- Trạng thái: đã triển khai ở baseline; regression bản bàn giao cần xác minh.
- API: POST /auth/register. UI: RegisterPage. Dữ liệu: users,user_roles.
- Test: AuthIntegrationTest; AuthFlow; E2E Reader. Evidence: CI đúng SHA, test runtime tương ứng; không dùng kết quả cũ cho mã mới.
- Giới hạn: không bao gồm các nghiệp vụ planned hoặc API ngoài contract.

### US-02

Là thành viên, tôi muốn đăng nhập bằng email hoặc mã thành viên để truy cập chức năng theo quyền.

- AC-02-01: Đúng mật khẩu vào ứng dụng; sai/khóa bị từ chối; refresh sau reload.
- Trạng thái: đã triển khai ở baseline; regression bản bàn giao cần xác minh.
- API: POST /auth/login,/auth/refresh. UI: LoginPage; AuthProvider. Dữ liệu: users,refresh_tokens.
- Test: AuthIntegrationTest; AuthFlow; client.test. Evidence: CI đúng SHA, test runtime tương ứng; không dùng kết quả cũ cho mã mới.
- Giới hạn: không bao gồm các nghiệp vụ planned hoặc API ngoài contract.

### US-03

Là thành viên, tôi muốn đăng xuất để kết thúc phiên trên thiết bị.

- AC-03-01: UI xóa phiên/cache; revoke refresh family; reload không khôi phục; access JWT cũ có thể còn hạn.
- Trạng thái: đã triển khai ở baseline; regression bản bàn giao cần xác minh.
- API: POST /auth/logout. UI: AuthProvider. Dữ liệu: refresh_tokens.
- Test: AuthIntegrationTest; client.test; E2E Reader. Evidence: CI đúng SHA, test runtime tương ứng; không dùng kết quả cũ cho mã mới.
- Giới hạn: không bao gồm các nghiệp vụ planned hoặc API ngoài contract.

### US-04

Là thành viên, tôi muốn xem hồ sơ của mình để kiểm tra thông tin tài khoản.

- AC-04-01: Principal từ JWT; chỉ đọc; profile null có trạng thái rõ; không có PATCH.
- Trạng thái: đã triển khai ở baseline; regression bản bàn giao cần xác minh.
- API: GET /me/profile. UI: ProfilePage. Dữ liệu: Identity projection.
- Test: MemberIntegrationTest; MemberFlow. Evidence: CI đúng SHA, test runtime tương ứng; không dùng kết quả cũ cho mã mới.
- Giới hạn: không bao gồm các nghiệp vụ planned hoặc API ngoài contract.

### US-05

Là thủ thư, tôi muốn tìm và lọc thành viên để tra cứu người cần hỗ trợ.

- AC-05-01: Mã/tên/status/page/sort từ server; Reader 403; không trả email/token.
- Trạng thái: đã triển khai ở baseline; regression bản bàn giao cần xác minh.
- API: GET /members. UI: MemberListPage. Dữ liệu: users.
- Test: MemberIntegrationTest; MemberFlow; E2E staff. Evidence: CI đúng SHA, test runtime tương ứng; không dùng kết quả cũ cho mã mới.
- Giới hạn: không bao gồm các nghiệp vụ planned hoặc API ngoài contract.

### US-06

Là người đọc, tôi muốn lọc sách theo từ khóa, tác giả và thể loại để chọn tài liệu phù hợp.

- AC-06-01: Filter/count đồng nhất; pagination; giữ URL; empty/error rõ.
- Trạng thái: đã triển khai ở baseline; regression bản bàn giao cần xác minh.
- API: GET /books. UI: CatalogPage; BookFilters. Dữ liệu: books,book_authors,book_categories.
- Test: BookIntegrationTest; CatalogFlow; E2E Reader. Evidence: CI đúng SHA, test runtime tương ứng; không dùng kết quả cũ cho mã mới.
- Giới hạn: không bao gồm các nghiệp vụ planned hoặc API ngoài contract.

### US-07

Là người đọc, tôi muốn xem các ấn bản của sách để phân biệt phiên bản xuất bản.

- AC-07-01: Book/Edition tách riêng; 404; không hiển thị availability giả.
- Trạng thái: đã triển khai ở baseline; regression bản bàn giao cần xác minh.
- API: GET /books/{id}; /books/{id}/editions. UI: BookDetailPage. Dữ liệu: books,editions,publishers.
- Test: EditionIntegrationTest; CatalogFlow; E2E Reader. Evidence: CI đúng SHA, test runtime tương ứng; không dùng kết quả cũ cho mã mới.
- Giới hạn: không bao gồm các nghiệp vụ planned hoặc API ngoài contract.

### US-08

Là người đọc, tôi muốn xem tác giả và các sách liên quan để khám phá tài liệu.

- AC-08-01: Đúng UUID; filter theo author; ảnh chưa duyệt fallback.
- Trạng thái: đã triển khai ở baseline; regression bản bàn giao cần xác minh.
- API: GET /authors/{id}; /books?authorId. UI: AuthorDetailPage. Dữ liệu: authors,book_authors.
- Test: AuthorIntegrationTest; CatalogFlow. Evidence: CI đúng SHA, test runtime tương ứng; không dùng kết quả cũ cho mã mới.
- Giới hạn: không bao gồm các nghiệp vụ planned hoặc API ngoài contract.

### US-09

Là thủ thư, tôi muốn quản lý tác phẩm và danh mục để giữ thông tin thư viện chính xác.

- AC-09-01: CRUD theo contract; FK/unique/422; Reader không ghi; reload còn dữ liệu.
- Trạng thái: đã triển khai ở baseline; regression bản bàn giao cần xác minh.
- API: Catalog CRUD. UI: StaffCatalogPage; CatalogForm. Dữ liệu: authors,categories,publishers,books,editions.
- Test: Catalog integration; CatalogFlow; E2E staff. Evidence: CI đúng SHA, test runtime tương ứng; không dùng kết quả cũ cho mã mới.
- Giới hạn: không bao gồm các nghiệp vụ planned hoặc API ngoài contract.

### US-10

Là thủ thư, tôi muốn quản lý vị trí và bản sách để theo dõi tài sản thư viện.

- AC-10-01: Barcode unique; branch/shelf nhất quán; stale version 409; không thêm DELETE ngoài contract.
- Trạng thái: đã triển khai ở baseline; regression bản bàn giao cần xác minh.
- API: Branch/Shelf/Copy APIs. UI: StaffCatalogPage. Dữ liệu: branches,shelves,book_copies.
- Test: InventoryCatalogIntegrationTest; Phase2RegressionTest; E2E Admin. Evidence: CI đúng SHA, test runtime tương ứng; không dùng kết quả cũ cho mã mới.
- Giới hạn: không bao gồm các nghiệp vụ planned hoặc API ngoài contract.

### US-11

Là thủ thư, tôi muốn tra cứu metadata theo ISBN để đối chiếu khi biên mục.

- AC-11-01: Checksum; provider timeout rõ; staff-only; không tự ghi Core; Google mặc định tắt.
- Trạng thái: đã triển khai ở baseline; regression bản bàn giao cần xác minh.
- API: GET /metadata/books/{isbn13}. UI: MediaEditor. Dữ liệu: Không persist payload provider.
- Test: metadata.spec; metadata-guard.spec; CatalogMedia; E2E metadata. Evidence: CI đúng SHA, test runtime tương ứng; không dùng kết quả cũ cho mã mới.
- Giới hạn: không bao gồm các nghiệp vụ planned hoặc API ngoài contract.

### US-12

Là thủ thư, tôi muốn duyệt ảnh có nguồn và căn cứ sử dụng để hiển thị minh họa đáng tin cậy.

- AC-12-01: Xác nhận thủ công; MIME/size/provenance; version chống stale; Reader không duyệt.
- Trạng thái: đã triển khai ở baseline; regression bản bàn giao cần xác minh.
- API: /catalog-media/{kind}/{id}. UI: MediaEditor; CatalogMedia. Dữ liệu: catalog_media_references.
- Test: MediaInspectorTest; MediaIntegrationTest; CatalogMedia. Evidence: CI đúng SHA, test runtime tương ứng; không dùng kết quả cũ cho mã mới.
- Giới hạn: không bao gồm các nghiệp vụ planned hoặc API ngoài contract.

### US-13

Là thủ thư, tôi muốn lưu, tìm lại và xóa lịch sử tra ISBN của mình để tái sử dụng quá trình tra cứu khi biên mục.

- AC-13-01: DB thật sau reload; prefix/page; owner-only cả ADMIN; replay tra nguồn hiện tại; write lỗi không báo thành công.
- Trạng thái: đã có implementation; PostgreSQL được CI kiểm, E2E và desktop phải đối chiếu SHA bàn giao.
- API: /metadata/history; /{id}; /{id}/replay. UI: MetadataHistory. Dữ liệu: Insight.metadata_lookups.
- Test: history.spec; history.integration; MetadataHistory.test; E2E Phase 2.5. Evidence: CI đúng SHA, test runtime tương ứng; không dùng kết quả cũ cho mã mới.
- Giới hạn: không lưu nội dung provider; test upgrade foundation riêng nằm trong suite PostgreSQL; không suy ownership từ client.

## Ma trận trace

Requirement FR-xx và Use Case UC-xx có cùng số với US-xx trong phạm vi này. Actor/mục tiêu/điều kiện thành công lấy trực tiếp từ story và AC; lỗi phải được phân tích thêm theo security matrix, không gộp thành một happy path. [Ma trận kiểm thử theo AC](../07-kiem-thu/story-test-matrix.md) là nguồn phân loại unit/integration/contract/frontend/E2E chi tiết; bảng dưới là chỉ mục đến code và thiết kế, không phân loại tất cả tên test trong một ô thành cùng loại.

| Story → requirement → use case | Thiết kế | API/UI/data | Unit/frontend: chỉ mục | Bộ test liên quan (nhiều lớp) | E2E/evidence |
|---|---|---|---|---|---|
| US-01 → FR-01 → UC-01 | [Class/flow](../02-kien-truc/lop-va-thuat-toan.md), [wireframe](../06-giao-dien/wireframes.md) | POST /auth/register; RegisterPage; users,user_roles | [Unit theo AC](../07-kiem-thu/story-test-matrix.md); frontend theo story | AuthIntegrationTest; AuthFlow; E2E Reader; OpenAPI validator | E2E web/desktop trên SHA bàn giao; chưa chốt toàn bộ |
| US-02 → FR-02 → UC-02 | [Class/flow](../02-kien-truc/lop-va-thuat-toan.md), [wireframe](../06-giao-dien/wireframes.md) | POST /auth/login,/auth/refresh; LoginPage; AuthProvider; users,refresh_tokens | [Unit theo AC](../07-kiem-thu/story-test-matrix.md); frontend theo story | AuthIntegrationTest; AuthFlow; client.test; OpenAPI validator | E2E web/desktop trên SHA bàn giao; chưa chốt toàn bộ |
| US-03 → FR-03 → UC-03 | [Class/flow](../02-kien-truc/lop-va-thuat-toan.md), [wireframe](../06-giao-dien/wireframes.md) | POST /auth/logout; AuthProvider; refresh_tokens | [Unit theo AC](../07-kiem-thu/story-test-matrix.md); frontend theo story | AuthIntegrationTest; client.test; E2E Reader; OpenAPI validator | E2E web/desktop trên SHA bàn giao; chưa chốt toàn bộ |
| US-04 → FR-04 → UC-04 | [Class/flow](../02-kien-truc/lop-va-thuat-toan.md), [wireframe](../06-giao-dien/wireframes.md) | GET /me/profile; ProfilePage; Identity projection | [Unit theo AC](../07-kiem-thu/story-test-matrix.md); frontend theo story | MemberIntegrationTest; MemberFlow; OpenAPI validator | E2E web/desktop trên SHA bàn giao; chưa chốt toàn bộ |
| US-05 → FR-05 → UC-05 | [Class/flow](../02-kien-truc/lop-va-thuat-toan.md), [wireframe](../06-giao-dien/wireframes.md) | GET /members; MemberListPage; users | [Unit theo AC](../07-kiem-thu/story-test-matrix.md); frontend theo story | MemberIntegrationTest; MemberFlow; E2E staff; OpenAPI validator | E2E web/desktop trên SHA bàn giao; chưa chốt toàn bộ |
| US-06 → FR-06 → UC-06 | [Class/flow](../02-kien-truc/lop-va-thuat-toan.md), [wireframe](../06-giao-dien/wireframes.md) | GET /books; CatalogPage; BookFilters; books,book_authors,book_categories | [Unit theo AC](../07-kiem-thu/story-test-matrix.md); frontend theo story | BookIntegrationTest; CatalogFlow; E2E Reader; OpenAPI validator | E2E web/desktop trên SHA bàn giao; chưa chốt toàn bộ |
| US-07 → FR-07 → UC-07 | [Class/flow](../02-kien-truc/lop-va-thuat-toan.md), [wireframe](../06-giao-dien/wireframes.md) | GET /books/{id}; /books/{id}/editions; BookDetailPage; books,editions,publishers | [Unit theo AC](../07-kiem-thu/story-test-matrix.md); frontend theo story | EditionIntegrationTest; CatalogFlow; E2E Reader; OpenAPI validator | E2E web/desktop trên SHA bàn giao; chưa chốt toàn bộ |
| US-08 → FR-08 → UC-08 | [Class/flow](../02-kien-truc/lop-va-thuat-toan.md), [wireframe](../06-giao-dien/wireframes.md) | GET /authors/{id}; /books?authorId; AuthorDetailPage; authors,book_authors | [Unit theo AC](../07-kiem-thu/story-test-matrix.md); frontend theo story | AuthorIntegrationTest; CatalogFlow; OpenAPI validator | E2E web/desktop trên SHA bàn giao; chưa chốt toàn bộ |
| US-09 → FR-09 → UC-09 | [Class/flow](../02-kien-truc/lop-va-thuat-toan.md), [wireframe](../06-giao-dien/wireframes.md) | Catalog CRUD; StaffCatalogPage; CatalogForm; authors,categories,publishers,books,editions | [Unit theo AC](../07-kiem-thu/story-test-matrix.md); frontend theo story | Catalog integration; CatalogFlow; E2E staff; OpenAPI validator | E2E web/desktop trên SHA bàn giao; chưa chốt toàn bộ |
| US-10 → FR-10 → UC-10 | [Class/flow](../02-kien-truc/lop-va-thuat-toan.md), [wireframe](../06-giao-dien/wireframes.md) | Branch/Shelf/Copy APIs; StaffCatalogPage; branches,shelves,book_copies | [Unit theo AC](../07-kiem-thu/story-test-matrix.md); frontend theo story | InventoryCatalogIntegrationTest; Phase2RegressionTest; E2E Admin; OpenAPI validator | E2E web/desktop trên SHA bàn giao; chưa chốt toàn bộ |
| US-11 → FR-11 → UC-11 | [Class/flow](../02-kien-truc/lop-va-thuat-toan.md), [wireframe](../06-giao-dien/wireframes.md) | GET /metadata/books/{isbn13}; MediaEditor; Không persist payload provider | [Unit theo AC](../07-kiem-thu/story-test-matrix.md); frontend theo story | metadata.spec; metadata-guard.spec; CatalogMedia; E2E metadata; OpenAPI validator | E2E web/desktop trên SHA bàn giao; chưa chốt toàn bộ |
| US-12 → FR-12 → UC-12 | [Class/flow](../02-kien-truc/lop-va-thuat-toan.md), [wireframe](../06-giao-dien/wireframes.md) | /catalog-media/{kind}/{id}; MediaEditor; CatalogMedia; catalog_media_references | [Unit theo AC](../07-kiem-thu/story-test-matrix.md); frontend theo story | MediaInspectorTest; MediaIntegrationTest; CatalogMedia; OpenAPI validator | E2E web/desktop trên SHA bàn giao; chưa chốt toàn bộ |
| US-13 → FR-13 → UC-13 | [Class/flow](../02-kien-truc/lop-va-thuat-toan.md), [wireframe](../06-giao-dien/wireframes.md) | /metadata/history; /{id}; /{id}/replay; MetadataHistory; Insight.metadata_lookups | history.spec; MetadataHistory.test | history.spec; history.integration; MetadataHistory.test; E2E Phase 2.5; OpenAPI validator | E2E web/desktop trên SHA bàn giao; chưa chốt toàn bộ |

## Phase 3 — Favorites, Reviews và Rating

### US-14 / FR-14 / UC-14

Là thành viên, tôi muốn lưu sách yêu thích và xem lại trong Thư viện của tôi.

- AC-14-01: lưu/bỏ lưu qua Core, giữ sau reload, chỉ dữ liệu principal; empty/error/pagination và đổi tài khoản không hiện cache cũ.
- API: `/me/favorites`, `/me/favorites/{bookId}`. UI: FavoriteButton, MyLibraryPage. Dữ liệu: V14 favorites.
- Test: FavoriteIntegrationTest, LibraryFlow, library-api, E2E Phase 3. Trạng thái: IMPLEMENTED; TESTED/INTEGRATED đối chiếu đúng PR/SHA.

### US-15 / FR-15 / UC-15

Là thành viên, tôi muốn viết, sửa hoặc xóa đánh giá của mình tại chi tiết sách.

- AC-15-01: một review/user/book; body 1–5000 ký tự; owner-only; null tường minh bị từ chối; PATCH khác field không làm mất cập nhật; xóa cần xác nhận; lỗi giữ input, không báo thành công giả.
- API: `/books/{bookId}/reviews`, `/{reviewId}` và `/me/reviews`. UI: ReviewSection/MyLibraryPage. Dữ liệu: V15 reviews.
- Test: ReviewIntegrationTest, ReviewConcurrencyTest, LibraryFlow, library-api, E2E Phase 3. Trạng thái: IMPLEMENTED; TESTED/INTEGRATED đối chiếu đúng PR/SHA.
- Giới hạn: không moderation; cùng field theo lần ghi database sau thắng, chưa có optimistic version.

### US-16 / FR-16 / UC-16

Là thành viên, tôi muốn cho điểm 1–5 và xem điểm trung bình của sách.

- AC-16-01: rating gắn review, radio thao tác bằng bàn phím; AVG/COUNT từ database; HALF_UP hai chữ số, rỗng null/0; summary tải lại sau create/update/delete.
- API: review mutation và `/books/{bookId}/reviews/summary`. UI: RatingInput/ReviewSection. Không có bảng rating riêng.
- Test: ReviewIntegrationTest, LibraryFlow, library-api, E2E Phase 3. Trạng thái: IMPLEMENTED; TESTED/INTEGRATED đối chiếu đúng PR/SHA.

Thiết kế chung: [Favorites/Reviews](../02-kien-truc/favorites-reviews.md), [W6](../06-giao-dien/wireframes.md), [ma trận test](../07-kiem-thu/story-test-matrix.md). Circulation/Hold/Inventory session/advanced search vẫn là roadmap, không thuộc đầu ra Phase 3.

## Phase 4 — giao dịch tại quầy

### US-17 / FR-17 / UC-17

Là nhân viên, tôi muốn cho mượn đúng bản sách, đúng người và nhận lại kết quả cũ nếu phải gửi lại yêu cầu do mất mạng.

- AC-17-01: chỉ staff ACTIVE còn quyền hiện hành; kiểm người mượn, quota, overdue, chi nhánh và version Copy. Hai người tranh bản cuối chỉ có một Loan đang mở.
- AC-17-02: cùng nhân viên/requestId/nội dung không tạo Loan thứ hai; nội dung khác với key cũ trả 409; rollback không để sót Copy/audit/outbox/receipt.
- API: POST `/loans`; schema Loan V16, receipt/audit V17. Test: LoanCommandIntegrationTest và LoanSchemaTest trên PostgreSQL thật.
- Trạng thái tại PR #15: backend đã triển khai; giao diện quầy và E2E hành trình mượn còn chờ. Không coi regression EXE Phase 3 là bằng chứng UI cho US-17.

### US-18 / FR-18 / UC-18

Là nhân viên, tôi muốn nhận trả đúng lượt mượn và giữ nguyên lịch sử giao dịch.

- AC-18-01: đúng chi nhánh, Loan còn mở và đúng version; Return mới cho Loan đã trả bị từ chối, retry cùng key nhận kết quả gốc. Người mượn bị khóa vẫn được trả sách.
- AC-18-02: Loan, Copy, audit và outbox thay đổi cùng transaction; khi có giữ chỗ phải phân bổ trong transaction trước khi trả kết quả.
- API: POST `/loans/{loanId}/return`. Test mốc PR #15: LoanCommandIntegrationTest, chưa kiểm AC-18-02 với Hold vì Hold chưa triển khai tại mốc đó.
- Trạng thái hiện tại: backend Return đã nối phân bổ Hold, kiểm bằng HoldIntegrationTest; UI và E2E lưu thông còn chờ.

### US-19 / FR-19 / UC-19

Là người mượn hoặc nhân viên, tôi muốn gia hạn lượt mượn hợp lệ mà không ảnh hưởng quyền của người đang chờ sách.

- AC-19-01: chỉ chủ lượt mượn hoặc staff còn quyền; người mượn ACTIVE, chưa tới hạn, còn lượt gia hạn và không có WAITING phù hợp tại chi nhánh.
- AC-19-02: hạn mới tính từ hạn cũ; tăng count/version, lưu lịch sử chính sách gia hạn, không thay snapshot lúc mượn. Retry không gia hạn thêm; renew/return đồng thời không mất cập nhật.
- API: POST `/loans/{loanId}/renew`. Test: HoldIntegrationTest; bảng `loan_extensions` V18.
- Trạng thái: backend đã có; giao diện và E2E lưu thông chưa hoàn thành.

### US-20 / FR-20 / UC-20

Là người đọc, tôi muốn giữ đúng ấn bản cần dùng tại chi nhánh nhận, theo dõi và hủy yêu cầu của mình.

- AC-20-01: chọn Edition cụ thể hoặc xác nhận bất kỳ Edition, không tự thay ISBN; một WAITING/READY mỗi người/Book kể cả khác chi nhánh.
- AC-20-02: FIFO trong các yêu cầu phù hợp; một Copy chỉ có một READY; trả/hủy/hết hạn phân bổ lại cùng transaction. Đúng hạn nhận đã hết hiệu lực, kể cả job chạy chậm.
- AC-20-03: reader không xem/hủy của người khác; staff chỉ được tra cứu, không có quyền hủy thay ngầm. Đổi phạm vi cần hủy/tạo mới, mất vị trí cũ.
- API: POST `/holds`, POST `/holds/{id}/cancel`, GET `/holds/{id}`, GET `/me/holds`, GET `/holds/queue` cho staff.
- Test: HoldIntegrationTest, HoldExpiryJobTest, LoanSchemaTest. Trạng thái: backend đã có; UI, ETA theo ngày và E2E còn chờ.
