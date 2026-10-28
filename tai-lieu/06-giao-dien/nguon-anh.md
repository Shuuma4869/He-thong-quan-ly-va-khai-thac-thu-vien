# Nguồn ảnh dùng trong giao diện

Ảnh minh họa ở các vùng giới thiệu được lưu trong `frontend/src/assets/img/`. Chúng không được dùng làm bìa của một cuốn sách hoặc chân dung của một tác giả cụ thể. Bìa và chân dung trong Catalog chỉ hiển thị khi tham chiếu media đã được duyệt theo quy trình riêng.

| Tệp | Tác giả và nguồn | Vị trí sử dụng |
|---|---|---|
| `auth/auth-cover-library.webp` | Olga Lioncat, Pexels, ảnh số 7244576 do nhóm cung cấp trước đó | Trang chủ, đăng nhập, đăng ký |
| `editorial/books-table.jpg` | [Anete Lusina, Pexels 5239563](https://www.pexels.com/photo/stack-of-textbooks-on-wooden-table-5239563/) | Trang khám phá sách |
| `editorial/library-readers.jpg` | [Tima Miroshnichenko, Pexels 9572376](https://www.pexels.com/photo/people-in-the-library-9572376/) | Đầu trang tác giả và thể loại |
| `editorial/reading-corner.jpg` | [KoolShooters, Pexels 6627188](https://www.pexels.com/photo/stack-of-books-on-the-edge-of-a-wooden-table-6627188/) | Khối giới thiệu hành trình đọc |
| `categories/adventure-trail.jpg` | [Alex Moliski, Pexels 27776930](https://www.pexels.com/photo/a-person-hiking-up-a-mountain-trail-27776930/) | Ảnh minh họa thể loại phiêu lưu, du lịch |
| `categories/historical-library.jpg` | [Esma Nur Büyükgüçlü, Pexels 35269123](https://www.pexels.com/photo/vintage-library-interior-with-book-collection-35269123/) | Ảnh minh họa thể loại lịch sử, cổ điển |
| `categories/science-lab.jpg` | [Mikhail Nilov, Pexels 9243727](https://www.pexels.com/photo/scientists-experimenting-in-the-laboratory-9243727/) | Ảnh minh họa thể loại khoa học, công nghệ |
| `categories/nature-forest.jpg` | [Teguh Sugi, Pexels 6903877](https://www.pexels.com/photo/a-green-trees-in-the-forest-6903877/) | Ảnh minh họa thể loại thiên nhiên, môi trường |
| `categories/romance-reading.jpg` | [Anastasia Nagibina, Pexels 27067376](https://www.pexels.com/photo/young-couple-reading-book-together-27067376/) | Ảnh minh họa thể loại lãng mạn |
| `categories/children-books.jpg` | [Caleb Oquendo, Pexels 34708269](https://www.pexels.com/photo/library-display-of-colorful-children-s-books-34708269/) | Ảnh minh họa thể loại thiếu nhi |
| `categories/art-studio.jpg` | [Cup of Couple, Pexels 7302103](https://www.pexels.com/photo/a-painter-painting-an-artwork-7302103/) | Ảnh minh họa nghệ thuật, hội họa |
| `categories/business-charts.jpg` | [RDNE Stock project, Pexels 7845375](https://www.pexels.com/photo/businesswomen-looking-at-a-chart-and-having-a-discussion-7845375/) | Ảnh minh họa kinh tế, tài chính |
| `categories/mathematics-board.jpg` | [Jean-Rene Chazottes, Pexels 28608151](https://www.pexels.com/photo/mathematicians-collaborate-on-chalkboard-equations-28608151/) | Ảnh minh họa toán học |

Mười hai ảnh JPG được tải từ CDN của Pexels ở chiều rộng 960–1600 px và lưu trong mã nguồn. Không có request ảnh tới Pexels khi người dùng mở giao diện. Chín ảnh thể loại chỉ minh họa cho nhóm tên đã ánh xạ; thể loại khác dùng nền chữ thiết kế. Ảnh WebP cũ đã có sẵn trong dự án; tệp gốc nhóm cung cấp trước đó hiện không còn tại đường dẫn local cũ nên chưa đối chiếu lại được trang ảnh cụ thể. Cần giữ thông tin gốc này khi thay ảnh.

[Giấy phép Pexels](https://www.pexels.com/license/) cho phép sử dụng và chỉnh sửa ảnh trong ứng dụng, không bắt buộc ghi công; nhóm vẫn ghi tên tác giả để dễ truy nguyên. Không bán lại ảnh nguyên bản, không dùng ảnh làm nhãn hiệu, và không ngụ ý người được chụp tán thành LAMS. Điều khoản đã được đối chiếu ngày 28/10/2026; cần kiểm lại trước khi phát hành công khai.

Tác giả và thể loại thiếu media đã duyệt dùng hình minh họa có nhãn hoặc bìa chữ, tùy thể loại. LAMS không gán ảnh thư viện chung thành chân dung hoặc ảnh bìa thật. Ảnh do nhân viên nhập URL qua quy trình duyệt Catalog vẫn được tải từ URL của nguồn khi hiển thị; phần đó chưa được chuyển sang lưu cục bộ và cần xem xét riêng về quyền sao chép trước khi thay đổi.
