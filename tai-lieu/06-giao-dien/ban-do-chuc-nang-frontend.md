# Bản đồ chức năng giao diện

Bảng này nối nghiệp vụ với API và đường vào trên giao diện. “Có UI” nghĩa là màn hình và thao tác đã nối API; chất lượng một hành trình thực tế vẫn phụ thuộc dữ liệu, quyền và E2E trên đúng bản build.

| Nghiệp vụ | API | Đường vào / thành phần | Kiểm thử hiện có | Trạng thái và phần còn thiếu |
|---|---|---|---|---|
| Đăng ký, đăng nhập, đăng xuất, phiên | Core `/auth/*` | `/dang-ky`, `/dang-nhap`, topbar | `AuthFlow` | Có UI; cần xác nhận lại với ba tài khoản demo trên web và EXE. |
| Hồ sơ | Core `/auth/me` | `/ho-so` | `AuthFlow` | Đọc hồ sơ; chưa có biểu mẫu cập nhật thông tin cá nhân. |
| Tác phẩm và tìm kiếm | Core `/public/catalog/books` | `/`, `/sach`, `BookFilters`, `BookList` | `CatalogFlow`, `ReaderHomePage`, Web E2E | Có tìm, lọc, sort, phân trang và URL state; ảnh phụ thuộc duyệt media. |
| Tác giả | Core `/public/catalog/authors`, lọc `authorId` | `/tac-gia`, `/tac-gia/:authorId`, bộ chọn trang chủ | `CatalogFlow`, `ReferencePicker`, `DirectoryPage` | Có trang duyệt/tìm và trang chi tiết; sách lọc theo UUID tác giả. |
| Thể loại và bí danh | Core `/public/catalog/categories`, `categoryTerm` | `/the-loai`, `/the-loai/:categoryId`, `/sach`, quản trị trong `/nhan-vien/danh-muc` | `CatalogFlow`, `DirectoryPage` | Có duyệt/tìm, trang chi tiết và lọc bí danh trong danh mục sách. |
| Book, Edition, Copy | Core `/books`, `/books/{id}/editions`, `/copies` | `/sach/:bookId`, `/nhan-vien/danh-muc` | `CatalogFlow` | Có quản trị và chọn Book → Edition khi sửa Copy; ISBN demo đang để trống có chủ đích. |
| Metadata ISBN và lịch sử | Insight `/metadata/books/*`, history API | `/nhan-vien/danh-muc` → Lịch sử tra cứu ISBN | `MetadataHistory` | Có UI; chỉ thử được với Edition có ISBN thật. |
| Duyệt ảnh | Core `/catalog-media/*`; Insight ứng viên | `/nhan-vien/danh-muc` → Ảnh và nguồn | `CatalogMedia`, `BookCover` | Có duyệt thủ công; 32 ảnh demo còn ở trạng thái ứng viên. |
| Yêu thích, review, điểm | Core `/me/favorites`, `/reviews` | Book card/detail, `/thu-vien-cua-toi` | `LibraryFlow`, `CatalogFlow` | Có UI; cần dữ liệu từ Reader demo để thử đầy đủ. |
| Loan, Hold, gia hạn | Core circulation API | `/muon-va-giu-cho`, `/giu-cho/:bookId/:editionId` | `CirculationFlow`, Web E2E | Có UI; Web E2E đã chạy trên database cô lập, chưa thử với ba tài khoản demo local. |
| Quầy mượn/trả | Core circulation API | `/nhan-vien/luu-thong` | `StaffCirculationFlow`, Web E2E | Có UI; Web E2E dùng Core, Insight và PostgreSQL thật trong môi trường thử nghiệm. |
| Thành viên | Core `/members` | `/nhan-vien/thanh-vien` | `MemberFlow` | Có tìm, lọc, phân trang; quyền Staff được chặn ở router và server. |
| Báo cáo lưu thông và CSV | Core report API | `/nhan-vien/bao-cao-luu-thong` | `report-api`, `CirculationFlow` | Có UI và export; không đồng nhất với báo cáo Acquisition. |
| Phiên kiểm kê, quét và xử lý sai lệch | Core `/inventory-sessions/*` | `/nhan-vien/kiem-ke` và trang phiên | `InventoryFlow`, Web E2E | Có UI; Web E2E đã kiểm hành trình mở, quét, chốt và xác nhận chuyển Copy trên database cô lập. |
| Dashboard nhân viên | Core Catalog và Inventory read API | `/nhan-vien/bang-dieu-khien` | `StaffDashboardPage` | Hiện số lượng thật và trạng thái tải/lỗi; không có feed hoạt động gần đây vì chưa có API tương ứng. |
| Đề xuất bổ sung | Core read facts, Insight Acquisition API | `/nhan-vien/de-xuat-bo-sung` | `AcquisitionFlow` | UI đã nối API trên nhánh Tuan; chưa coi là hoàn tất học phần trước CI/E2E của commit bàn giao. |

Điều hướng Sidebar chỉ trỏ tới các route trên. Tài khoản Reader không có quyền mở trang nhân viên; API kiểm quyền độc lập với guard ở giao diện. OpenAPI trong `contracts/openapi/` là nguồn chi tiết cho request/response và mã lỗi.

Các dòng có Web E2E dùng tài khoản và dữ liệu được tạo trong PostgreSQL cô lập cho lượt kiểm thử, không chứng minh ba tài khoản demo local đã được cấp. Ưu tiên tiếp theo trước buổi trình diễn: cấp và kiểm quyền ba tài khoản demo, duyệt một số ảnh bìa có bằng chứng sử dụng phù hợp, rồi thử các hành trình Reader/Staff trên chính database demo. Biểu mẫu cập nhật hồ sơ, feed hoạt động dashboard, dữ liệu ISBN của ấn bản in và nguồn tín hiệu Acquisition còn thiếu là phần việc riêng; giao diện không hiển thị nút giả để che các khoảng trống này.
