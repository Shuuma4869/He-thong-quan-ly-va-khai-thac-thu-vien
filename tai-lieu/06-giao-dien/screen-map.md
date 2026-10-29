# Bản đồ màn hình

Web và Windows dùng chung React; Windows dùng HashRouter. Bảng dưới mô tả đường dẫn trong ứng dụng, không phải URL API. Chặn route chỉ hỗ trợ trải nghiệm; Core và Insight vẫn kiểm quyền ở mỗi endpoint.

| Khu vực | Đường dẫn | Nội dung |
|---|---|---|
| Công khai | `/`, `/dang-nhap`, `/dang-ky` | Giới thiệu, đăng nhập và đăng ký Reader |
| Công khai | `/sach`, `/sach/:bookId` | Tìm/lọc/phân trang, tác phẩm, ấn bản, tình trạng bản sách theo chi nhánh, đánh giá |
| Công khai | `/tac-gia`, `/tac-gia/:authorId` | Danh sách và chi tiết tác giả |
| Công khai | `/the-loai`, `/the-loai/:categoryId` | Danh sách và chi tiết thể loại |
| Mọi người | `/cai-dat/giao-dien` | Xem trước, lưu, bỏ thay đổi, khôi phục preset; khách lưu trên trình duyệt |
| Đã đăng nhập | `/ho-so` | Sửa hồ sơ, đổi mật khẩu, thu hồi phiên; đổi email khi SMTP được bật |
| Đã đăng nhập | `/thu-vien-cua-toi` | Yêu thích, đánh giá của mình và tóm tắt mượn/giữ chỗ |
| Đã đăng nhập | `/muon-va-giu-cho`, `/giu-cho/:bookId/:editionId` | Lịch sử mượn, gia hạn, giữ chỗ theo chi nhánh, hủy yêu cầu |
| Đã đăng nhập | `/thong-bao` | Hộp thư riêng, đánh dấu đã đọc; chuông topbar xem nhanh tối đa năm mục |
| Librarian/Admin | `/nhan-vien/bang-dieu-khien` | Số liệu danh mục, bản sách, kiểm kê, mượn/quá hạn, đề xuất và hoạt động giữ chỗ |
| Librarian/Admin | `/nhan-vien/thanh-vien` | Danh sách, tìm/lọc/sắp xếp và phân trang thành viên |
| Librarian/Admin | `/nhan-vien/danh-muc` | Author, Category, Publisher, Book, Edition, Branch, Shelf, Copy; duyệt media và lịch sử ISBN |
| Librarian/Admin | `/nhan-vien/luu-thong` | Quầy mượn/trả và hàng chờ nhận sách |
| Librarian/Admin | `/nhan-vien/bao-cao-luu-thong` | Báo cáo lượt mượn và CSV |
| Librarian/Admin | `/nhan-vien/bao-cao-giu-cho` | Báo cáo sự kiện giữ chỗ, lọc ngày/chi nhánh/tác phẩm và CSV |
| Librarian/Admin | `/nhan-vien/kiem-ke`, `/nhan-vien/kiem-ke/:sessionId` | Mở phiên, snapshot, quét, chốt và xác nhận xử lý bất thường; camera/offline tùy khả năng thiết bị |
| Librarian/Admin | `/nhan-vien/de-xuat-bo-sung` | Phân tích tín hiệu thật, lập đề xuất, xét duyệt nội bộ, audit và CSV |
| Admin | `/nhan-vien/tai-khoan` | Khóa/mở tài khoản, đổi vai trò có lý do và lịch sử |
| Admin | `/nhan-vien/bao-cao-danh-gia` | Xử lý nội dung đánh giá bị báo cáo |
| Mọi người | Đường dẫn không tồn tại | 404 có quay lại và về trang chủ |

Lịch sử ISBN nằm trong Catalog, không thêm route. React-Bootstrap chỉ áp dụng trong `.metadata-history`; xem [wireframe W5](wireframes.md). Book Detail tách Book, Edition và Copy; “Xem ấn bản và giữ chỗ” chuyển focus trong cùng trang, không điều hướng tới một route Edition không tồn tại. Các tác phẩm Gutenberg tham khảo không tự có tồn kho vật lý.

Giữ chỗ có ước tính thời gian theo điều kiện hiện tại; ước tính không phải cam kết được nhận sách. Semantic search và dashboard doanh thu chưa được triển khai. Báo cáo giữ chỗ là lịch sử sự kiện, không thay thế trạng thái hàng chờ hiện hành.
