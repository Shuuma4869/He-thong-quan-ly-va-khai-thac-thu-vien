# Nguồn ảnh dùng trong giao diện

Ảnh minh họa ở các vùng giới thiệu được lưu trong `frontend/src/assets/img/`. Chúng không được dùng làm bìa của một cuốn sách hoặc chân dung của một tác giả cụ thể. Bìa và chân dung trong Catalog chỉ hiển thị khi tham chiếu media đã được duyệt theo quy trình riêng.

| Tệp | Tác giả và nguồn | Vị trí sử dụng |
|---|---|---|
| `auth/auth-cover-library.webp` | Olga Lioncat, Pexels, ảnh số 7244576 do nhóm cung cấp trước đó | Trang chủ, đăng nhập, đăng ký |
| `editorial/books-table.jpg` | [Anete Lusina, Pexels 5239563](https://www.pexels.com/photo/stack-of-textbooks-on-wooden-table-5239563/) | Trang khám phá sách |
| `editorial/library-readers.jpg` | [Tima Miroshnichenko, Pexels 9572376](https://www.pexels.com/photo/people-in-the-library-9572376/) | Đầu trang tác giả và thể loại |
| `editorial/reading-corner.jpg` | [KoolShooters, Pexels 6627188](https://www.pexels.com/photo/stack-of-books-on-the-edge-of-a-wooden-table-6627188/) | Khối giới thiệu hành trình đọc |

Ba ảnh mới được tải từ CDN ảnh của Pexels với chiều rộng 1400–1600 px và nén theo tham số của CDN, sau đó lưu trong mã nguồn. Không có request ảnh tới Pexels khi người dùng mở giao diện. Ảnh cũ là bản WebP đã có sẵn trong dự án; tệp gốc mà nhóm cung cấp trước đó hiện không còn tại đường dẫn local cũ nên chưa đối chiếu lại được trang ảnh cụ thể. Cần giữ thông tin gốc này khi thay ảnh.

[Giấy phép Pexels](https://www.pexels.com/license/) cho phép sử dụng và chỉnh sửa ảnh trong ứng dụng, không bắt buộc ghi công; nhóm vẫn ghi tên tác giả để dễ truy nguyên. Không bán lại ảnh nguyên bản, không dùng ảnh làm nhãn hiệu, và không ngụ ý người được chụp tán thành LAMS. Điều khoản đã được đối chiếu ngày 28/10/2026; cần kiểm lại trước khi phát hành công khai.

Tác giả và thể loại thiếu media đã duyệt dùng bìa chữ có nhãn đúng trạng thái. LAMS không gán ảnh thư viện chung thành chân dung hoặc ảnh bìa thật. Ảnh do nhân viên nhập URL qua quy trình duyệt Catalog vẫn được tải từ URL của nguồn khi hiển thị; phần đó chưa được chuyển sang lưu cục bộ và cần xem xét riêng về quyền sao chép trước khi thay đổi.
