# Favorites, Reviews và Rating

## Phạm vi và quyền

Backend nền tảng do Toan triển khai ở PR #11: Favorites V14, Reviews V15 và rating tính từ reviews. Tuan review, sửa lỗi tích hợp và phụ trách giao diện. Core dùng Spring JDBC/PostgreSQL; Insight không tham gia ghi dữ liệu này.

Các API yêu cầu phiên đăng nhập hợp lệ. Service đọc lại trạng thái ACTIVE và role READER/LIBRARIAN/ADMIN từ Identity; JWT cũ không giữ được quyền đã bị thu hồi. Favorites luôn lấy owner từ principal. Review công khai với tài khoản được phép đọc Catalog, nhưng chỉ owner được sửa/xóa; staff không có quyền moderation ngầm. DTO review chỉ trả cờ `mine`, không trả userId, email hoặc tên người viết.

## Persistence và cạnh tranh

DEV1 bổ sung hai truy vấn cho UI: GET `/me/favorites/{bookId}` trả `{bookId, saved}`; GET `/me/reviews` phân trang và lọc tùy chọn theo `bookId`. Cả hai chỉ dùng principal, không nhận userId để đổi scope. Bộ lọc review không có kết quả trả trang rỗng; Favorite state kiểm Book tồn tại trước khi trả trạng thái. Không cần migration mới. My Library không tải mọi review công khai để tìm dữ liệu của mình.

- Favorite có khóa `(user_id, book_id)`, FK cascade. PUT tạo mới trả 201, lặp trả 200; DELETE trả 204 kể cả chưa lưu nếu Book tồn tại. Nếu add/remove cạnh tranh liên tục, PUT có thể trả 409 để client tải lại.
- Review có unique user–book, FK restrict, body 1–5000 ký tự Unicode sau strip và rating 1–5. Concurrent create chỉ có một bản ghi; request trùng trả 409.
- List dùng transaction RepeatableRead để count và items cùng snapshot; thứ tự có UUID tie-break. Không nối giá trị người dùng vào SQL.
- Rating đọc AVG/COUNT trực tiếp, làm tròn hai chữ số HALF_UP; rỗng trả `average: null, count: 0`. Một lần đọc phản ánh snapshot của câu SELECT, không phải cam kết dữ liệu sẽ không đổi ngay sau response.

## Partial PATCH

Field không gửi giữ nguyên. `null` tường minh không có nghĩa xóa field, trả 422; body trắng, rating ngoài 1–5 và request không có field cần sửa cũng trả 422.

Service kiểm owner rồi UPDATE có điều kiện book/review/owner. Giá trị field không gửi được lấy ngay tại câu UPDATE (`COALESCE`), không ghép với bản cũ trong bộ nhớ. Hai PATCH sửa body và rating riêng biệt không ghi đè field của nhau. Hai PATCH cùng sửa body hoặc cùng sửa rating theo quy tắc lần ghi được database thực hiện sau thắng; chưa có optimistic version hoặc cảnh báo xung đột chỉnh sửa trên nhiều thiết bị. `updated_at` lấy thời điểm thực hiện UPDATE thay vì thời điểm mở transaction.

Nếu DELETE commit sau bước kiểm owner nhưng trước UPDATE, PATCH trả 404, không khôi phục review. Nếu UPDATE giữ khóa trước, DELETE chờ rồi xóa; một response PATCH thành công không bảo đảm review còn tồn tại sau một DELETE tiếp theo.

## Xóa Book trong lúc tạo dữ liệu

Kiểm tồn tại trước INSERT không loại được mọi race. Khi INSERT đang chờ FK và Book bị xóa, service chỉ chuyển SQLSTATE 23503 thành 404; lỗi khác không bị che bằng thông báo trùng dữ liệu. Transaction thất bại rollback, không truy vấn tiếp trong transaction PostgreSQL đã abort. FK vẫn là lớp bảo vệ cuối, không bỏ constraint hoặc tạo lại Book.

## Kiểm chứng

UI dùng `FavoriteButton`, `ReviewSection`, `RatingInput` và `MyLibraryPage`. Query key chứa userId; đổi tài khoản remount component, AuthProvider xóa cache, shared client bỏ response thuộc session generation cũ. Form PATCH chỉ gửi field đã đổi. Review body render dạng text, không dùng HTML của người viết. Các lỗi 401/403/404/409/422 có thông báo riêng; lỗi không xác định khuyên tải lại vì server có thể đã commit. Chưa có request idempotency cho POST review; unique user–book ngăn tạo hai review nhưng không thay cơ chế đối chiếu request.

Favorite và review cá nhân phân trang độc lập, size 10. Nếu xóa phần tử cuối ở trang cuối, trang đó có thể rỗng và người dùng quay lại trang trước; không tự báo mất toàn bộ dữ liệu. Một client khác sửa cùng field vẫn theo last database write wins, UI không phát hiện version conflict.

`ReviewConcurrencyTest` dùng PostgreSQL Testcontainers, service thật và hai TransactionTemplate độc lập. Điểm đồng bộ chỉ chặn sau SELECT thật để hai PATCH cùng đọc bản cũ. Test khác giữ transaction DELETE Book và xác minh INSERT đang bị chặn bằng `pg_blocking_pids` trước khi commit. Không dùng mock database hoặc sleep ngẫu nhiên làm bằng chứng.

Regression bao gồm hai field độc lập, cùng field, delete/update, xóa Book/insert, current-role/status, token hết hạn, owner, validation, aggregate và migration từ V13. Kết quả từng SHA ở CI/PR; tài liệu này mô tả cơ chế, không thay kết quả kiểm thử.
