# Hợp đồng Catalog và Inventory — Phase 2

Trạng thái: hợp đồng backend cho các API Catalog/Inventory đã triển khai trong Phase 2. Giao diện Catalog, tích hợp metadata/ảnh và các nghiệp vụ mượn-trả không thuộc hợp đồng này.

## Quyền và quy tắc chung

- GET Author, Category, Publisher, Book và Edition cho phép tài khoản ACTIVE đã đăng nhập, gồm READER; quyền ghi và toàn bộ Inventory chỉ dành cho LIBRARIAN hoặc ADMIN. Trạng thái tài khoản và quyền ghi được kiểm tra lại từ Identity hiện tại. Chưa đăng nhập trả 401; tài khoản bị khóa trả 403.
- Danh sách dùng `page` mặc định 0, `size` mặc định 20, giới hạn 1–100, response `{items,page:{number,size,totalElements,totalPages}}`.
- Dữ liệu truy vấn được bind; tên cột sắp xếp/quan hệ được xác định ở máy chủ.
- Validation trả 422, đối tượng không tồn tại trả 404, ràng buộc duy nhất/khóa ngoại/xung đột version trả 409. Lỗi theo Problem Details kèm `requestId`.
- OpenAPI tách `BookCopyRequest` khi tạo mới khỏi `BookCopyUpdateRequest` khi PATCH; chỉ PATCH bắt buộc `version` và thiếu version trả 422.
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
- GET danh sách kết hợp `query` (tên sách, tối đa 500 ký tự), `authorId`, `categoryId`; count và items dùng cùng điều kiện lọc. Từ khóa được chuẩn hóa NFKC rồi gộp khoảng trắng Unicode; `%`, `_`, `\` là ký tự nguyên văn. UUID sai trả 400; UUID hợp lệ nhưng không khớp trả trang rỗng. Thứ tự cố định theo tên chuẩn hóa rồi UUID.
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
- Shelf: `POST/GET /api/v1/shelves`, `GET/PATCH /api/v1/shelves/{shelfId}`. Có thể lọc theo `branchId`; Branch bắt buộc tồn tại; mã Shelf chỉ unique trong một Branch. Có thể chuyển kệ rỗng sang Branch khác; không chuyển khi còn BookCopy. Chuyển kệ và tạo/chuyển Copy vào kệ khóa cùng bản ghi Shelf đến cuối giao dịch, tránh kiểm tra rỗng rồi bị thêm sách trước khi ghi. Không có API xóa.
- BookCopy: `POST/GET /api/v1/copies`, `GET/PATCH /api/v1/copies/{copyId}`. Có thể lọc theo `editionId`, `shelfId`, `status`. Bản mới bắt đầu `IN_PROCESS`, `version=0`; barcode unique.
- PATCH BookCopy yêu cầu version hiện tại, chỉ sửa Edition/barcode/Shelf và tăng version có điều kiện. Không nhận trường status; bản `ON_LOAN`/`ON_HOLD` không được sửa bảo trì. Chuyển trạng thái lưu thông thuộc command riêng ở phase sau.
- API bảo trì không tính availability; trạng thái Copy/Loan/Hold mới là nguồn dữ liệu để tính tình trạng sẵn có.

## Migration và kiểm chứng

| Migration | Nội dung |
|---|---|
| V3–V5 | `authors`, `categories`, `publishers` |
| V6 | `books`, `book_authors`, `book_categories` |
| V7 | `editions` |
| V8–V9 | `branches`, `shelves` |
| V10 | `book_copies` |

`CatalogIntegrationTest` kiểm tra DB mới chạy đủ migration và OpenAPI có các endpoint/entity tách biệt. Integration tests theo từng module kiểm tra PostgreSQL thật, quyền, validation, ràng buộc, phân trang và rollback. OpenAPI là file dùng chung; Tuan review thay đổi contract này trước khi merge.
