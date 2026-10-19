# Hợp đồng Catalog và Inventory — Phase 2

Hợp đồng các API Catalog/Inventory và tham chiếu ảnh Phase 2. Metadata nằm ở Insight theo `contracts/openapi/insight-api.yaml`; nghiệp vụ mượn-trả chưa thuộc phạm vi này.

## Quyền và quy tắc chung

- GET Author/Category/Publisher/Book/Edition cho tài khoản ACTIVE còn READER/LIBRARIAN/ADMIN. Các API ghi và toàn bộ Branch/Shelf/Copy chỉ dành cho LIBRARIAN/ADMIN. Controller kiểm JWT; service kiểm lại status và role hiện tại từ Identity. Anonymous trả 401, bị khóa/vô hiệu hóa hoặc không còn role hợp lệ trả 403. Thu hồi staff nhưng vẫn còn READER chỉ giữ quyền đọc Catalog.
- Danh sách dùng `page` mặc định 0, `size` mặc định 20, giới hạn 1–100, response `{items,page:{number,size,totalElements,totalPages}}`.
- Dữ liệu truy vấn được bind; tên cột sắp xếp/quan hệ được xác định ở máy chủ.
- Validation trả 422, đối tượng không tồn tại trả 404, ràng buộc duy nhất/khóa ngoại/xung đột version trả 409. Lỗi theo Problem Details kèm `requestId`.
- Migration chỉ tiến về trước; không sửa V1/V2 hoặc migration đã áp dụng. Tên đã trim trước khi lưu; khóa định danh chuẩn hóa của Category là Unicode NFKC, gộp khoảng trắng và không phân biệt hoa thường.

## Author, Category, Publisher

| Tài nguyên | Endpoint | Quy tắc dữ liệu |
|---|---|---|
| Author | `/api/v1/authors` và `/{authorId}`: GET/POST/PATCH/DELETE | Tên bắt buộc, tối đa 200 ký tự; không tự coi tên trùng là cùng tác giả. Xóa khi Book tham chiếu trả 409. |
| Category | `/api/v1/categories` và `/{categoryId}`: GET/POST/PATCH/DELETE | Tên bắt buộc, tối đa 150 ký tự; khóa chuẩn hóa unique ở DB. Trùng trả 409; xóa khi Book tham chiếu trả 409. |
| Publisher | `/api/v1/publishers` và `/{publisherId}`: GET/POST/PATCH/DELETE | Tên bắt buộc, tối đa 200 ký tự; không áp đặt unique. Có thể chưa được Edition tham chiếu; xóa khi đang được tham chiếu trả 409. |

GET danh sách hỗ trợ phân trang; tạo trả 201, đọc/cập nhật trả 200, xóa trả 204. Chỉ Author/Category/Publisher là dữ liệu danh mục, không thay cho Book hay Edition.

## Book — tác phẩm logic

- `POST/GET /api/v1/books`, `GET/PATCH/DELETE /api/v1/books/{bookId}`.
- GET kết hợp `query`, `authorId`, `categoryId` trước phân trang. Query NFKC/gộp whitespace Unicode, tối đa 500 ký tự; `%`, `_`, `\` được tìm nguyên văn, không nối vào SQL. Filter UUID sai trả 422; UUID đúng nhưng không khớp trả trang rỗng. Sắp xếp cố định `normalized_title,id`; count/items dùng cùng điều kiện trong transaction read-only REPEATABLE_READ.
- Request gồm `title`, `description` tùy chọn, `authorIds[]` và `categoryIds[]`. Title bắt buộc; tên quan hệ phải tồn tại. ID quan hệ lặp được gộp, không tạo dòng nối trùng.
- Tạo/cập nhật Book cùng hai bảng nối trong một transaction; lỗi quan hệ làm rollback toàn bộ.
- Response có `id`, `title`, `description`, `authors[]`, `categories[]`. Không có ISBN, barcode, số bản hoặc availability.
- Không xóa Book đang được Edition hoặc nghiệp vụ khác tham chiếu; trả 409.

## Edition — ấn bản

- `POST/GET /api/v1/books/{bookId}/editions`, `GET/PATCH/DELETE /api/v1/books/{bookId}/editions/{editionId}`.
- Book bắt buộc tồn tại. Publisher tùy chọn. ISBN-13 tùy chọn, nếu có phải gồm 13 chữ số; chưa đặt unique vì chưa có quy tắc toàn cục được duyệt. Năm và ngôn ngữ cũng tùy chọn.
- Mỗi Edition có UUID riêng; hai ấn bản của cùng Book vẫn là hai dòng riêng. Xóa khi BookCopy tham chiếu trả 409.

## Branch, Shelf và BookCopy

- Branch: `POST/GET /api/v1/branches`, `GET/PATCH /api/v1/branches/{branchId}`. Mã được trim/viết hoa và unique; tên bắt buộc; status chỉ ACTIVE/DISABLED. Không có API xóa trong phạm vi này.
- Shelf: `POST/GET /api/v1/shelves`, `GET/PATCH /api/v1/shelves/{shelfId}`. Có thể lọc theo `branchId`; Branch bắt buộc tồn tại; mã Shelf chỉ unique trong một Branch. Có thể chuyển kệ rỗng sang Branch khác; không chuyển khi còn BookCopy. Không có API xóa.
- BookCopy: `POST/GET /api/v1/copies`, `GET/PATCH /api/v1/copies/{copyId}`. Có thể lọc theo `editionId`, `shelfId`, `status`. Bản mới bắt đầu `IN_PROCESS`, `version=0`; barcode unique.
- PATCH BookCopy yêu cầu version hiện tại, chỉ sửa Edition/barcode/Shelf và tăng version có điều kiện. Không nhận trường status; bản `ON_LOAN`/`ON_HOLD` không được sửa bảo trì. Chuyển trạng thái lưu thông thuộc command riêng ở phase sau.
- DTO create và update tách biệt; PATCH thiếu/âm version trả 422, version cũ trả 409. Hai cập nhật cùng version chỉ một lần được ghi. Tạo/chuyển Copy và chuyển Branch của Shelf khóa cùng hàng Shelf trước khi kiểm/ghi; kệ đang có Copy không chuyển chi nhánh. GET Copy không lấy khóa ghi.
- API bảo trì không tính availability; trạng thái Copy/Loan/Hold mới là nguồn dữ liệu để tính tình trạng sẵn có.

## Migration và kiểm chứng

| Migration | Nội dung |
|---|---|
| V3–V5 | `authors`, `categories`, `publishers` |
| V6 | `books`, `book_authors`, `book_categories` |
| V7 | `editions` |
| V8–V9 | `branches`, `shelves` |
| V10 | `book_copies` |
| V11 | Java migration chuẩn hóa lại Category/Book cũ; giữ UUID và quan hệ |
| V12 | `catalog_media_references`, tối đa một ảnh được duyệt cho mỗi Edition hoặc Author |
| V13 | Sequence revision cho tham chiếu ảnh, không dùng lại version khi xóa rồi tạo lại |

V11 kiểm tra toàn bộ dữ liệu trước khi ghi. Nếu hai Category về cùng khóa chuẩn hóa, migration dừng và báo UUID xung đột; người phụ trách xác định lại tên trước khi chạy tiếp. Không tự xóa/gộp Category và không sửa migration cũ. Các test nâng cấp từ V2/V10 kiểm việc giữ role, ID, FK và rollback khi có collision.

## Tham chiếu ảnh

`GET/POST/DELETE /api/v1/catalog-media/{kind}/{subject}`, `kind` là `authors` hoặc `editions`, subject là UUID thật. GET cho các role đọc Catalog và trả `{media:null}` khi chưa có ảnh. POST/DELETE chỉ dành cho nhân viên; không có API upload hoặc tải về MinIO.

POST cần nguồn/định danh, URL nguồn/ảnh/giấy phép, nội dung giấy phép, ghi công, bằng chứng đúng tác giả/ấn bản và `confirmed:true`. `expectedVersion:null` để tạo mới; thay ảnh cần version hiện tại. Core kiểm ảnh HTTPS theo allowlist, MIME/signature JPEG/PNG/WebP, tối đa 2 MiB, deadline 6 giây và tối đa 4 lượt kiểm đồng thời mỗi process (quá tải trả 429). Không theo redirect. Kiểm mạng nằm ngoài transaction; quyền được kiểm lại trước câu ghi có điều kiện. Response 200 chứa người/thời điểm duyệt và version; stale version trả 409. DELETE cần query version, trả 204, chỉ xóa tham chiếu.

Version media là revision do database cấp, không phải số lần sửa của riêng ảnh và không nhất thiết liên tiếp. Client chỉ gửi lại giá trị đã đọc, không tự cộng hoặc mặc định 0. Xóa rồi duyệt ảnh mới không tái sử dụng revision cũ; request từ biểu mẫu cũ phải trả 409 thay vì ghi đè/xóa nhầm ảnh mới. BookCopy vẫn dùng quy tắc version riêng.

Giấy phép và đúng danh tính là trách nhiệm xác minh của nhân viên; kiểm kỹ thuật không tự chứng minh quyền sử dụng. Bảng lưu lần duyệt hiện tại, chưa phải nhật ký lịch sử mọi thay đổi. Xem [media strategy](../03-du-lieu/media-strategy.md).

`CatalogIntegrationTest` kiểm tra DB mới chạy đủ migration và OpenAPI có các endpoint/entity tách biệt. Integration tests theo từng module kiểm tra PostgreSQL thật, quyền, validation, ràng buộc, phân trang và rollback. OpenAPI là file dùng chung; Tuan review thay đổi contract này trước khi merge.
