# Wireframe phạm vi học phần

Wireframe là bản bố cục chức năng, không phải screenshot chứng minh runtime. Đối chiếu component và đo trên web/desktop trước nghiệm thu UI.

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
+ Header ----------------------------------------------------+
| Danh mục: [Từ khóa] [Tác giả v] [Thể loại v]                  |
| Card sách       Card sách       Card sách                  |
| [Trước]         Trang / tổng                   [Sau]        |
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

## Kiểm tính thuận tiện

Chưa có kết quả đo thao tác runtime cho bản Phase 2.5. Quy ước đo đề xuất: bắt đầu sau đăng nhập tại trang liên quan; ghi riêng click/chọn và nhập liệu; hỏi giảng viên cách đếm trước kết luận “≤4”. Kịch bản: tìm sách→detail; mở history→tra/lưu; lọc→mở lại; xóa→xác nhận; tạo Catalog. Ghi viewport, trạng thái đầu, thao tác, kết quả và điểm vướng. Không suy số bước đo được chỉ từ wireframe.

Tham khảo Booking.com ở nguyên tắc tìm kiếm nổi bật, lọc sát kết quả và hành động rõ; không dùng logo/ảnh của họ, chưa có đánh giá đối chiếu trực quan chính thức. React-Bootstrap hỗ trợ stylesheet tùy chọn: https://react-bootstrap.github.io/docs/getting-started/introduction/.
