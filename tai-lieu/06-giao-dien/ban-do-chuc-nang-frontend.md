# Bản đồ chức năng giao diện

Bảng này nối nghiệp vụ với API và đường vào trên giao diện. “Có UI” nghĩa là màn hình và thao tác đã nối API; chất lượng một hành trình thực tế vẫn phụ thuộc dữ liệu, quyền và E2E trên đúng bản build.

| Nghiệp vụ | API | Đường vào / thành phần | Kiểm thử hiện có | Trạng thái và phần còn thiếu |
|---|---|---|---|---|
| Đăng ký, đăng nhập, đăng xuất, phiên | Core `/auth/*` | `/dang-ky`, `/dang-nhap`, topbar | `AuthFlow` | Có UI; cần xác nhận lại với ba tài khoản demo trên web và EXE. |
| Hồ sơ | Core `/me/account`, `/auth/me` | `/ho-so` | `MemberFlow`, `AccountCenterIntegrationTest` | Sửa tên/số điện thoại, đổi mật khẩu và thu hồi phiên. Đổi email mới ghi nhận yêu cầu chờ; chưa có gửi thư/xác minh. |
| Tác phẩm và tìm kiếm | Core `/public/catalog/books`, `/authors`, `/categories` | `/`, `/sach`, `BookFilters`, `BookList`, tìm kiếm trên topbar | `CatalogFlow`, `SearchCommand`, Web E2E | Có tìm, lọc, sort, phân trang, URL state và gợi ý tối đa bốn mục mỗi nhóm. 10.000 định danh Gutenberg là thư mục tham khảo, không phải số Copy. Ảnh phụ thuộc duyệt media. |
| Tác giả | Core `/public/catalog/authors`, `/authors/media`, lọc `authorId` | `/tac-gia`, `/tac-gia/:authorId`, bộ chọn trang chủ | `CatalogFlow`, `DirectoryPage` | Có trang duyệt/tìm, chi tiết và ảnh đã duyệt nếu có. Dữ liệu demo chưa có chân dung được duyệt; không tự suy diễn tiểu sử từ tên. |
| Thể loại và bí danh | Core `/public/catalog/categories`, `/categories/media`, `categoryTerm` | `/the-loai`, `/the-loai/:categoryId`, `/sach`, quản trị trong `/nhan-vien/danh-muc` | `CatalogFlow`, `DirectoryPage` | Có duyệt/tìm, trang chi tiết và lọc bí danh. Ảnh minh họa chỉ lấy từ bìa đã duyệt của sách thuộc thể loại; thiếu ảnh dùng hình thay thế. |
| Book, Edition, Copy | Core `/books`, `/books/{id}/editions`, `/copies` | `/sach/:bookId`, `/nhan-vien/danh-muc` | `CatalogFlow` | Có quản trị và chọn Book → Edition khi sửa Copy; ISBN demo đang để trống có chủ đích. |
| Metadata ISBN và lịch sử | Insight `/metadata/books/*`, history API | `/nhan-vien/danh-muc` → Lịch sử tra cứu ISBN | `MetadataHistory` | Có UI; chỉ thử được với Edition có ISBN thật. |
| Duyệt ảnh | Core `/catalog-media/*`; Insight ứng viên | `/nhan-vien/danh-muc` → Ảnh và nguồn | `CatalogMedia`, `BookCover` | Có duyệt thủ công; 8 bìa đã đối chiếu cho demo local, 24 ứng viên còn chờ. Máy khác cần chạy script duyệt demo hoặc thao tác qua UI. |
| Yêu thích, review, điểm | Core `/me/favorites`, `/reviews`, `/public/catalog/books/batch` | Book card/detail, `/thu-vien-cua-toi` | `LibraryFlow`, `CatalogFlow` | Sách yêu thích dùng lại Book Card đầy đủ; đánh giá và URL hash tách phần rõ ràng. Cần ảnh đã duyệt để có bìa thật. |
| Loan, Hold, gia hạn | Core circulation API | `/muon-va-giu-cho`, `/giu-cho/:bookId/:editionId` | `CirculationFlow`, Web E2E | Có UI; Web E2E đã chạy trên database cô lập, chưa thử với ba tài khoản demo local. |
| Quầy mượn/trả | Core circulation API | `/nhan-vien/luu-thong` | `StaffCirculationFlow`, Web E2E | Có UI; Web E2E dùng Core, Insight và PostgreSQL thật trong môi trường thử nghiệm. |
| Thành viên | Core `/members` | `/nhan-vien/thanh-vien` | `MemberFlow` | Có tìm, lọc, phân trang; quyền Staff được chặn ở router và server. |
| Báo cáo lưu thông và CSV | Core report API | `/nhan-vien/bao-cao-luu-thong` | `report-api`, `CirculationFlow` | Có UI và export; không đồng nhất với báo cáo Acquisition. |
| Phiên kiểm kê, quét và xử lý sai lệch | Core `/inventory-sessions/*` | `/nhan-vien/kiem-ke` và trang phiên | `InventoryFlow`, Web E2E | Có UI; Web E2E đã kiểm hành trình mở, quét, chốt và xác nhận chuyển Copy trên database cô lập. |
| Dashboard nhân viên | Core Catalog và Inventory read API | `/nhan-vien/bang-dieu-khien` | `StaffDashboardPage` | Hiện số lượng thật và trạng thái tải/lỗi; không có feed hoạt động gần đây vì chưa có API tương ứng. |
| Đề xuất bổ sung | Core read facts, Insight Acquisition API | `/nhan-vien/de-xuat-bo-sung` | `AcquisitionFlow`, Web/EXE E2E 18/18 | UI đã nối API; E2E kiểm Loan/Hold thật, phân tích, lưu, reload, duyệt/từ chối, audit và CSV. Chưa có lịch sử Favorite, sự kiện tìm rỗng hoặc chính sách retention production. |

Điều hướng Sidebar chỉ trỏ tới các route trên. Tài khoản Reader không có quyền mở trang nhân viên; API kiểm quyền độc lập với guard ở giao diện. OpenAPI trong `contracts/openapi/` là nguồn chi tiết cho request/response và mã lỗi.

## Cách trình bày

Web và Tauri dùng chung React, route và stylesheet. `premium.css` bổ sung nền trắng, điểm nhấn xanh trời và hệ token màu/chuyển động cho các màn ứng dụng sau trang chủ. Sidebar có thể thu gọn trên desktop, còn màn hẹp dùng ngăn kéo; mục đang chọn được tính theo cả đường dẫn và hash để không tô sáng hai mục cùng lúc. Topbar giữ vị trí khi cuộn, ô tìm kiếm chung có phím tắt Ctrl+K. Nội dung mở rộng theo cửa sổ tới 1640 px; màn 390, 768, 1024, 1366, 1440, 1536 và 1920 px cần được đối chiếu bằng ảnh ở đúng bản build bàn giao.

Chữ nội dung dùng Be Vietnam Pro, tiêu đề dùng Literata. Cả hai được đóng gói cùng frontend và có bộ ký tự tiếng Việt; chạy desktop không cần tải font từ CDN. Trang chủ giữ nguyên cấu trúc giới thiệu, tìm kiếm và các khối nội dung đã thống nhất. Catalog có vùng giới thiệu, tìm nhanh và bộ lọc URL; trang sách tách giới thiệu, thông tin nguồn, ấn bản, đánh giá và tác phẩm liên quan. Số ấn bản lấy từ API; giao diện không suy đoán số bản sẵn sàng để mượn. Trang tác giả và thể loại dùng chung lưới sách, trạng thái tải/lỗi/trống và phân trang của server.

Ảnh bìa chỉ xuất hiện sau khi tham chiếu của Edition được nhân viên duyệt. Khi chưa có ảnh hoặc ảnh ngoài tải lỗi, `BookCover` trình bày tên tác phẩm và tác giả như một bìa chữ, có nhãn phân biệt với ảnh thật. Nguồn và ghi công đi cùng ảnh đã duyệt; xem [quy trình media](../03-du-lieu/media-strategy.md) và [dữ liệu demo](../09-demo/du-lieu-demo.md). Hiệu ứng hover/focus ngắn; thiết lập giảm chuyển động của hệ điều hành tắt animation không cần thiết.

Các dòng có Web E2E dùng tài khoản và dữ liệu được tạo trong PostgreSQL cô lập cho lượt kiểm thử, không chứng minh ba tài khoản demo local đã được cấp. Trước buổi trình diễn, kiểm lại tài khoản demo, tám tham chiếu bìa và các hành trình Reader/Staff trên chính database demo. Feed hoạt động dashboard, dữ liệu ISBN của ấn bản in, xác minh email và một số tín hiệu Acquisition còn thiếu; giao diện không hiển thị nút giả để che các khoảng trống này.
