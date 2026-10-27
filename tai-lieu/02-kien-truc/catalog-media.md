# Kiến trúc Catalog, Inventory và media

## Ranh giới dữ liệu

Core sở hữu Book (tác phẩm), Edition (ấn bản), BookCopy (bản vật lý), các danh mục và tham chiếu ảnh đã duyệt trong PostgreSQL. UUID/FK là quan hệ thật; ISBN thuộc Edition, barcode thuộc Copy. Không có `books.available/total`; số bản và trạng thái chỉ lấy từ Copy hoặc nghiệp vụ lưu thông hiện hành.

React dùng API client chung, Zod kiểm response, TanStack Query quản lý trạng thái mạng. `/sach` có query/author/category/page/size trong URL; lọc/phân trang chạy ở Core, không tải toàn bộ danh mục để lọc trên client. `ReferencePicker` tìm tác giả, thể loại và tác phẩm ở server, giới hạn 20 mục/trang, debounce và giữ UUID trong form. Route staff có guard; server vẫn là nơi quyết định quyền.

Thanh tìm kiếm trên app shell gọi ba truy vấn nhỏ ở Core (tác phẩm, tác giả, thể loại), mỗi loại tối đa bốn gợi ý. Request cũ bị hủy khi người dùng đổi từ khóa. Danh sách yêu thích lấy metadata Book qua `/public/catalog/books/batch` với tối đa 20 ID mỗi lượt; giao diện dùng lại Book Card của Catalog thay vì tự dựng bản rút gọn. Hai API `/public/catalog/authors/media` và `/public/catalog/categories/media` trả ảnh đã được nhân viên duyệt cho các ID được hỏi. Ảnh thể loại là bìa đã duyệt của một tác phẩm thực sự thuộc thể loại đó. Khi chưa có ảnh phù hợp, giao diện hiển thị hình thay thế, không tự gán ảnh hoặc chân dung từ tên gọi.

## Hai luồng độc lập

```text
Reader/Staff → React hoặc Tauri → Core → PostgreSQL
                                    └─ CRUD, FK, khóa/version, ảnh đã duyệt

Staff → Insight → Open Library / Google Books / Wikimedia
           └─ kiểm quyền qua Core; trả ứng viên và nguồn, không ghi Catalog
Staff đối chiếu và xác nhận → Core kiểm ảnh → ghi tham chiếu có version
Staff có thể nhập ứng viên Standard Ebooks từ danh sách demo; vẫn duyệt từng ảnh qua Core
```

Không giữ transaction Catalog trong lúc tra nhà cung cấp. Nếu provider lỗi, UI vẫn quản lý dữ liệu Core và dùng fallback ảnh. Ảnh chỉ đi vào luồng đọc sau khi staff duyệt; metadata tra cứu không tự thay thông tin tác phẩm. [Media strategy](../03-du-lieu/media-strategy.md) nêu định danh, giấy phép, giới hạn và dữ liệu gửi ra ngoài.

## Quyền, khóa và migration

- JWT được kiểm ở controller; service đọc status/role hiện tại từ Identity. Thu hồi toàn bộ quyền hoặc vô hiệu hóa tài khoản có hiệu lực cả với JWT còn hạn. Reader chỉ đọc Catalog; Inventory và mutation yêu cầu nhân viên.
- Book create/update và các bảng nối nằm trong cùng transaction. Query dùng bind parameters, escape wildcard; count/items có cùng snapshot REPEATABLE_READ.
- Shelf branch transfer và Copy create/move khóa cùng hàng Shelf trước khi kiểm tra/ghi. Copy cập nhật bằng version có điều kiện, không ghi đè thay đổi đồng thời. Không thêm khóa vào GET chỉ để kiểm tồn tại.
- V11 chuẩn hóa NFKC rồi gộp whitespace Unicode cho dữ liệu Category/Book cũ, giữ nguyên FK. Collision dừng migration thay vì tự gộp/xóa. V12 thêm tham chiếu ảnh một-một với Edition/Author, người duyệt tham chiếu Identity.
- V13 cấp revision media từ sequence chung cho tạo/cập nhật. Việc gỡ rồi tạo ảnh không làm version quay về 0, tránh biểu mẫu cũ ghi đè/xóa nhầm tham chiếu mới. Migration giữ nguyên revision hiện có và cấp giá trị mới lớn hơn; client không tự tính revision.
- V24 thêm Standard Ebooks vào tập nguồn ảnh có thể duyệt. Migration chỉ thay CHECK constraint, không thêm ảnh hoặc tự phê duyệt ảnh.

Tauri đóng gói cùng UI, không truy cập PostgreSQL trực tiếp. WebView chỉ điều hướng trong ứng dụng. Lệnh native `open_catalog_source` chỉ mở URL HTTPS thuộc allowlist nhà cung cấp, không cho shell/file/URL tùy ý; CSP giới hạn các host ảnh. Secret nhà cung cấp ở Insight, không ở bundle desktop.

## Giới hạn đã biết

Chưa có media upload/history, cập nhật ảnh tự động, cloud Insight, signing/updater hay nghiệm thu máy Windows thứ hai. Bản cài local chỉ đóng gói giao diện, Core/Insight/PostgreSQL vẫn chạy riêng. Ảnh demo còn ở trạng thái ứng viên cho đến khi nhân viên duyệt.
