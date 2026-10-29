# Wireframe phạm vi học phần

Wireframe là bản bố cục chức năng, không phải screenshot chứng minh runtime. Đối chiếu component và đo trên web/desktop trước nghiệm thu UI.

## W0 — Landing và không gian thư viện

```text
Landing /: Header ngang → hero ảnh thư viện → tìm sách nổi → thể loại từ Core
           → sách mới cập nhật → sách lọc theo thể loại từ Core → giới thiệu
           → tạo tài khoản → footer.

Workspace: Sidebar trái | Header gọn (tìm sách, tài khoản)
                       | Nội dung: bộ lọc → lưới bìa sách → phân trang.
Mobile: header có nút menu; sidebar là drawer có nền che, Escape và giữ focus.
```

Khách được xem tác phẩm, tác giả và ấn bản công khai. Ảnh bìa trên card lấy từ ấn bản mới nhất trong số các ấn bản có ảnh được nhân viên duyệt; nếu không có, card dùng bìa chữ. Các thao tác lưu sách, đánh giá, mượn và giữ chỗ vẫn yêu cầu đăng nhập. Tìm kiếm trên landing chuyển filter thật vào URL Catalog; không thông báo thành công trước khi Core trả dữ liệu.

## W1 — Đăng nhập/đăng ký

```text
Desktop
+---------------------------+--------------------------------+
| Ảnh thư viện / nhận diện   | LAMS / tiêu đề                 |
| Giới thiệu ngắn           | [Email hoặc mã thành viên    ] |
|                           | [Mật khẩu             Hiện   ] |
|                           | [ ] Ghi nhớ   [Đăng nhập]      |
|                           | Lỗi field / lỗi server         |
|                           | Liên kết đăng ký               |
+---------------------------+--------------------------------+
Mobile: ẩn/thu gọn vùng ảnh; form một cột, không cuộn ngang.
Register: họ tên → email → mật khẩu → xác nhận → Đăng ký.
```

W1 mapping US-01/02/03, LoginPage/RegisterPage/AuthProvider. Pending khóa submit; lỗi field tại ô; login thất bại không điều hướng. Logout xóa UI/cache; lỗi server phải hiển thị trung thực.

## W2 — Hồ sơ và thành viên

```text
+ Header / điều hướng ---------------------------------------+
| Hồ sơ của tôi: tên, mã, email và trạng thái được API cho phép|
| Profile bổ sung: thông báo chưa có (không nút Lưu giả)       |
+------------------------------------------------------------+
| Nhân viên / Thành viên                                     |
| [Tìm mã hoặc họ tên] [Trạng thái v] [Sắp xếp v]              |
| Mã             Họ tên                  Trạng thái           |
| ...                                                        |
| [Trước]          Trang / tổng số             [Sau]          |
+------------------------------------------------------------+
```

W2 mapping US-04/05. Reader không có trang staff; loading thay bảng, empty có giải thích, error có thử lại. Mobile bảng có vùng cuộn được gắn nhãn.

## W3 — Danh mục / Book / Author detail

```text
+ Sidebar ---+ Header gọn -----------------------------------+
| Khám phá   | Danh mục: [Từ khóa] [Tác giả v] [Thể loại v]   |
| Thư viện   | Card bìa sách   Card bìa sách   Card bìa sách  |
| Hồ sơ      | [Trước]   Trang / tổng   [Sau]                |
+------------+-----------------------------------------------+
| Card sách: bìa đã duyệt / placeholder, tiêu đề, tác giả      |
|              thể loại, link chi tiết; không có rating giả    |
+------------------------------------------------------------+
| Book detail: Ảnh đã duyệt | Tiêu đề / tác giả / thể loại     |
| Mô tả                                                       |
| Danh sách ấn bản: ISBN / năm / ngôn ngữ / nhà xuất bản        |
| Không có bộ đếm availability khi chưa có nghiệp vụ thật     |
+------------------------------------------------------------+
| Author detail: initials/ảnh | tên / tiểu sử / sách liên quan |
+------------------------------------------------------------+
```

W3 mapping US-06/07/08. Filter giữ URL, debounce và hủy response cũ. 404 khác empty. Không dùng ảnh chưa duyệt.

## W4 — Staff Catalog/Inventory và duyệt ảnh

```text
+ Danh mục thư viện -----------------------------------------+
| [Xem Catalog] [Lịch sử tra cứu ISBN]                         |
| [Loại dữ liệu v]  [Chọn tác phẩm nếu là Edition]             |
| [Thêm] [Tải lại]                                            |
| Bảng: tên / thông tin / [Sửa] [Xóa nếu contract có] [Ảnh]    |
| Form: field có nhãn / lỗi → [Lưu] [Đóng]                    |
| Xác nhận xóa: tác động → [Xác nhận] [Giữ lại]                |
+------------------------------------------------------------+
| Ảnh và nguồn: [ISBN/OL id] [Tra nguồn]                      |
| Ứng viên + nguồn; license/evidence; checkbox xác nhận       |
| [Duyệt] [Gỡ ảnh đã duyệt] [Đóng]                           |
+------------------------------------------------------------+
```

W4 mapping US-09/10/11/12. Pending tránh mutation kép; 409 yêu cầu tải lại; không xóa Branch/Shelf/Copy ngoài contract.

## W5 — History trong staff workflow

```text
+ Lịch sử tra cứu ISBN của tôi -------------------------------+
| Giới hạn lưu dữ liệu và ý nghĩa mở lại                      |
| [ISBN-13................] [Tra cứu và lưu lịch sử]          |
| [Đầu ISBN...............] [Lọc lịch sử]                     |
| Status / alert / kết quả hiện tại + liên kết nguồn          |
| ISBN / thời gian / trạng thái nguồn                        |
| [Mở lại ISBN] [Xóa ISBN]                                    |
|   Xác nhận xóa: [Xác nhận xóa lịch sử] [Giữ lại]             |
| [Trang trước]     Trang / tổng số       [Trang sau]         |
+------------------------------------------------------------+
```

W5 mapping US-13; MetadataHistory dùng React-Bootstrap Form/Button/Alert/Spinner với CSS scoped, không Bootstrap Reboot toàn cục. Thay tài khoản remount theo userId; query key có owner; backend luôn xác thực lại. Mở lại trả nguồn hiện tại, không snapshot. Mobile các control wrap một cột. Error không để kết quả cũ trông như kết quả vừa lưu.

## W6 — Review và Thư viện của tôi

```text
Book Detail
  Tiêu đề / mô tả / [Lưu yêu thích hoặc Bỏ yêu thích]
  Các ấn bản
  Đánh giá của bạn đọc: trung bình / tổng số
  Đánh giá của tôi: [Nội dung............]
                   (1) (2) (3) (4) (5) [Lưu]
  hoặc [Sửa] [Xóa] → xác nhận / giữ lại
  Danh sách review (plain text) → phân trang

Thư viện của tôi
  Sách yêu thích: liên kết sách + [Bỏ yêu thích] → phân trang
  Đánh giá đã viết: nội dung / điểm / liên kết sách → phân trang
```

W6 mapping US-14/15/16. Hai danh sách cá nhân dùng pagination độc lập; không có tab Loan/Hold giả. Mobile control wrap, card không có chiều rộng cố định. Rating dùng radio native hỗ trợ phím mũi tên; xác nhận hủy xóa trả focus về nút xóa. Loading/error không thay bằng danh sách rỗng. Ảnh/test W1–W5 dưới đây là bằng chứng các SHA cũ, không phải nghiệm thu W6.

## Kiểm tính thuận tiện

Đã kiểm tự động trên Chromium/Linux với API/PostgreSQL thật ở head `0075377`, CI run 39871120289; không phải nghiên cứu với người dùng đại diện. Ảnh [1440/390 px](../../ho-so-nop-bai/minh-chung-giao-dien/README.md) đã đối chiếu W5: đúng thứ tự form → kết quả → history → phân trang, không tràn ngang; Tab từ ISBN rỗng bỏ qua submit disabled và tới bộ lọc, focus nhìn thấy. Profile, Member, Author và Staff Copy trong artifact cũng được đối chiếu W2–W4. W1 được kiểm luồng bằng E2E, chưa chụp/đối chiếu trực quan riêng trong bộ ảnh này.

W1 đã được kiểm trực quan bổ sung trên Chrome Windows qua Vite local ở commit `0075377`, viewport 1440/390: form login/register không tràn ngang, ảnh bên trái trên desktop và form một cột trên mobile. Lượt này không submit tài khoản và không thay E2E Auth/PostgreSQL của CI; ảnh kiểm tạm không phải ảnh cửa sổ EXE.

Số thao tác dưới đây đếm từ lệnh tương tác đã chạy thành công trong E2E, không tính đăng nhập/đợi mạng/scroll tự động; một lần `fill` là một thao tác nhập, không phải một phím. Đây không phải kết luận đạt cách đếm chưa được giảng viên xác nhận.

| Hành trình | Điểm bắt đầu | Thao tác thực hiện | Kết quả / giới hạn |
|---|---|---|---|
| Lưu history | Staff Catalog đã đăng nhập | Mở history → nhập ISBN → nhấn tra/lưu: 2 click + 1 nhập | Có bản ghi sau reload; không ghi Core |
| Replay | History đang mở, có bản ghi | Nhấn Mở lại: 1 click | Có trạng thái nguồn hiện tại; không tạo record mới |
| Xóa history | Có record thuộc mình | Xóa → xác nhận: 2 click | API 204, list trống; không xóa sách |
| Xem hồ sơ | Reader vừa đăng ký | Hồ sơ của tôi: 1 click | Hiện dữ liệu tài khoản và profile null |
| Lọc thành viên | Staff Member list | Nhập từ khóa → chọn status: 1 nhập + 1 chọn | Tổng số/empty do server, không lọc local |

Ngày 23/10/2026, cùng tám hành trình đã đạt trên EXE/WebView2 local tại `ee929cd`, qua Core/Insight/PostgreSQL tạm thật. Ảnh nội dung WebView2 1440/390 đã đối chiếu W5, không tràn ngang và focus bộ lọc rõ. Xem [nguồn ảnh desktop](../../ho-so-nop-bai/minh-chung-giao-dien/README.md).

Còn phải đo với người dùng: độ dễ hiểu thông báo, thời gian hoàn thành, focus sau lỗi/xóa và tiêu chí “≤4” theo định nghĩa học phần. Không tuyên bố mọi hành trình Catalog/Inventory đạt bốn tương tác; form nhiều field phải đếm riêng.

Tham khảo Booking.com ở nguyên tắc tìm kiếm nổi bật, lọc sát kết quả và hành động rõ; không dùng logo/ảnh của họ, chưa có đánh giá đối chiếu trực quan chính thức. React-Bootstrap hỗ trợ stylesheet tùy chọn: https://react-bootstrap.github.io/docs/getting-started/introduction/.

## W7 — Báo cáo hoạt động giữ chỗ

```text
Sidebar / Topbar / Tìm kiếm / Chuông thông báo
Hoạt động giữ chỗ — giới thiệu và múi giờ Việt Nam
  Từ ngày [date]       Đến trước ngày [date]
  Chi nhánh [chọn]     Tác phẩm [tìm và chọn]
  [Xem hoạt động giữ chỗ]
  Giới hạn sáu tháng lịch và 10.000 nhóm
Kết quả: tổng sự kiện / kỳ đã áp dụng / [Xuất CSV]
  Tạo / Sẵn sàng / Đã nhận / Hủy / Hết hạn
  Ngày | Chi nhánh | Sự kiện | Số lần
  [Trước]  Trang x/y, 50 nhóm/trang  [Sau]
```

Màn hẹp xếp bộ lọc thành một cột; bảng nằm trong vùng cuộn ngang có nhãn và focus bàn phím. Chưa chọn kỳ, không có sự kiện, đang tải và lỗi là bốn trạng thái riêng. CSV dùng bộ lọc đã áp dụng, không dùng phần nhập đang sửa. Báo cáo không diễn giải tổng sự kiện thành số người hoặc số Hold duy nhất.

## W8 — Bảng điều khiển và truy cập nhanh

```text
Bảng điều khiển / [Cập nhật số liệu]
Tác phẩm / Bản sách / Phiên mở / Đang mượn / Quá hạn / Đề xuất
Biểu đồ sự kiện giữ chỗ 30 ngày | Ba lượt quá hạn gần đây
Phiên kiểm kê đang mở          | Mượn trả / Báo cáo
Đề xuất bổ sung                | Tài khoản và nội dung (Admin)
```

Mỗi khối dùng trạng thái tải/lỗi riêng. Các nhóm widget có thể ẩn, hiện trong Appearance; thứ tự giữ cố định. Chuông mở hộp thoại xem nhanh năm thông báo, dẫn tới hộp thư riêng. Tìm kiếm trên điện thoại mở hộp thoại thay vì thu nhỏ ô nhập desktop. Các wireframe này mô tả cấu trúc triển khai, không phải bằng chứng đã nghiệm thu bằng hình chụp.
