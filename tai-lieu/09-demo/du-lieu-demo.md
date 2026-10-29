# Dữ liệu demo trên máy phát triển

Bộ dữ liệu này chỉ dành cho database local `lams_core` của Compose project `lams`. Không chạy các lệnh dưới đây với database đang chứa dữ liệu thật. Script từ chối seed nếu đã có tác phẩm nằm ngoài bộ demo.

## Chuẩn bị

Khởi động Docker, Core và Insight theo [hướng dẫn chạy local](../08-van-hanh/chay-local.md). Sau đó, từ thư mục gốc:

```powershell
pwsh -NoProfile -File .\scripts\seed-demo-catalog.ps1
pwsh -NoProfile -File .\scripts\provision-demo-users.ps1
```

Nếu muốn tạo mật khẩu mạnh mà không nhập ba lần, dùng `pwsh -NoProfile -File .\scripts\provision-demo-users.ps1 -ConfirmDemoDatabase -GeneratePasswords`. Script giữ mật khẩu trong `.tools/demo-credentials.xml` bằng cơ chế mã hóa gắn với tài khoản Windows đang chạy; file này bị Git bỏ qua. Chạy lại dùng chính các mật khẩu đã lưu, không đặt lại mật khẩu tài khoản cũ. Nếu tài khoản demo đã có nhưng file mật khẩu không còn, chế độ sinh mật khẩu từ chối chạy; dùng chế độ nhập mật khẩu đã biết. Để xem mật khẩu trên **terminal của chính bạn**, chạy `Import-Clixml .\.tools\demo-credentials.xml | ForEach-Object { "$($_.UserName): $($_.GetNetworkCredential().Password)" }`; tránh chụp hoặc đưa kết quả vào Git/chat. Nếu chuyển sang tài khoản Windows hoặc máy khác, file mã hóa này không giải được.

Lệnh đầu yêu cầu gõ `DEMO` rồi thêm 32 tác phẩm, 17 tác giả, 12 thể loại, ba bí danh thể loại, 32 ấn bản, 64 bản sách, hai chi nhánh và hai kệ. Chạy lại không tạo bản ghi trùng; nếu bản seed cũ đã lưu khóa thể loại dạng bỏ dấu, lần chạy mới cập nhật khóa cho khớp cách Core tra cứu. Tên tác phẩm, tác giả và đường dẫn nguồn đã được đối chiếu với Standard Ebooks ngày 26/10/2026. Thể loại, bí danh và mô tả tiếng Việt là phần biên mục phục vụ demo; barcode và chi nhánh có tiền tố `DEMO`. Mỗi tác phẩm hiện chỉ có một Edition demo. ISBN, nhà xuất bản và năm xuất bản để trống vì chưa có thông tin về một bản in cụ thể; không dùng dữ liệu này để chứng minh nhiều ấn bản in của cùng sách.

Lệnh thứ hai tạo ba tài khoản qua Auth API, rồi gán đúng vai trò nhân viên trong database demo. Nhập mật khẩu đã lưu riêng tại dấu nhắc của PowerShell; script không lưu hoặc in mật khẩu. Nếu email đã tồn tại, script giữ nguyên mật khẩu và dừng nếu vai trò không khớp. Các tài khoản là:

| Email | Vai trò |
|---|---|
| `reader.demo@lams.test` | READER |
| `librarian.demo@lams.test` | LIBRARIAN |
| `admin.demo@lams.test` | ADMIN |

Script kiểm tra đăng nhập, `/auth/me`, quyền truy cập Staff, refresh và logout qua API. Không có đường đăng ký công khai để tự chọn vai trò Librarian/Admin. Loan, Hold, Favorite và Review chỉ được tạo qua các luồng nghiệp vụ khi chuẩn bị buổi trình diễn; seed không ghi thẳng các bản ghi này. Trước khi script tài khoản chạy xong và trả kết quả kiểm quyền, chỉ có Catalog demo sẵn sàng trên máy local.

Muốn thử tìm kiếm và phân trang với dữ liệu lớn, sau bộ seed 32 tác phẩm có thể nhập [10.000 định danh nguồn Project Gutenberg](catalog-nguon-gutenberg.md). Đây là Book tham khảo, chưa phải 10.000 ấn bản hay bản vật lý của thư viện. Script seed nhỏ phải chạy trước, vì nó chủ động từ chối database đã có Book ngoài bộ demo.

## Ảnh bìa

[Danh sách 32 bìa ứng viên](anh-bia-ung-vien.csv) ghi Edition ID, trang tác phẩm, URL ảnh và trang giải thích quyền sử dụng. Tạo lại danh sách bằng:

```powershell
node .\scripts\demo-catalog.mjs --media-review > .\tai-lieu\09-demo\anh-bia-ung-vien.csv
```

Danh sách 32 URL là ứng viên, không tự xuất hiện trong Catalog. Mười hai bìa đã được đối chiếu nhan đề/tác giả trên trang tác phẩm, tranh và họa sĩ trong colophon của Standard Ebooks, cùng thời điểm hoàn thành tranh. Các họa sĩ này mất trước năm 1923. Standard Ebooks [dành phần thiết kế họ tạo cho phạm vi công cộng theo CC0](https://standardebooks.org/about/standard-ebooks-and-the-public-domain); tranh gốc được kiểm thêm theo thời hạn bảo hộ tại nơi trình diễn. Để ghi 12 tham chiếu đã rà vào **database demo local**, sau khi cấp tài khoản quản trị demo, chạy:

```powershell
pwsh -NoProfile -File .\scripts\approve-demo-covers.ps1 -ListOnly
pwsh -NoProfile -File .\scripts\approve-demo-covers.ps1
```

Lệnh thứ hai yêu cầu xác nhận `DEMO`, dùng tài khoản `admin.demo@lams.test`, kiểm từng Edition với nhan đề/tác giả trong PostgreSQL rồi gọi API duyệt của Core. Nếu đã có đúng URL thì bỏ qua; nếu có URL khác thì dừng, không ghi đè. Kho mật khẩu demo được giải mã bằng đúng tài khoản Windows đã tạo; ở máy khác script hỏi mật khẩu qua SecureString. Có thể dùng `-ConfirmDemoDatabase` khi chạy không tương tác trên database demo đã kiểm. Kết quả ở máy chuẩn bị trình diễn: **12 ảnh đã duyệt (37,5%)**, 20 ứng viên còn lại chưa duyệt. Chạy script trên máy khác để tạo lại 12 tham chiếu; không sao chép database hoặc kho mật khẩu sang Git.

Các bìa được duyệt vẫn là ảnh ngoài tải trực tiếp từ Standard Ebooks, không được nhúng vào repository hoặc EXE. Nhân viên cần kiểm lại quyền và nguồn khi chuyển sang môi trường ngoài demo, nhất là nếu thay ảnh hoặc triển khai ở nước khác. Chỉ ảnh được duyệt mới đi qua API công khai; ảnh thiếu, tải chậm hoặc tải lỗi dùng bìa chữ có tên tác phẩm. Không lấy bìa ngẫu nhiên cho 10.000 tác phẩm tham khảo.

Google Books vẫn bị khóa khỏi phần hiển thị bìa công khai. Standard Ebooks được thêm như một nguồn có thể duyệt thủ công; URL ảnh phải ở `standardebooks.org`, là HTTPS, không redirect và vượt qua kiểm MIME/kích thước của Core. Nếu điều kiện quyền hoặc định danh chưa rõ, bỏ qua ảnh đó.

Bốn bìa bổ sung được đối chiếu ngày 30/10/2026. Nguồn quyền và bằng chứng tranh được lưu cùng tham chiếu khi gọi API; không dựa riêng vào tên tác giả để chấp thuận.

| Tác phẩm | Tranh bìa theo colophon | Đối chiếu bổ sung |
|---|---|---|
| Frankenstein — Mary Shelley | Portrait of Adam, 1578; Giuseppe Arcimboldo (mất 1593) | [Kunsthistorisches Museum](https://www.khm.at/de/object/73) |
| The Time Machine — H. G. Wells | The Black Marble Clock, khoảng 1870; Paul Cézanne (mất 1906) | [National Gallery of Art](https://www.nga.gov/artists/1115-paul-cezanne) |
| The Invisible Man — H. G. Wells | Village in the Snow, 1894; Paul Gauguin (mất 1903) | [National Gallery](https://www.nationalgallery.org.uk/artists/paul-gauguin) |
| The Island of Doctor Moreau — H. G. Wells | Cannon Rock, 1895; Winslow Homer (mất 1910) | [Metropolitan Museum](https://www.metmuseum.org/art/collection/search/11113) |

Bộ demo vẫn chưa có chân dung tác giả được duyệt. CSV ứng viên ghi trạng thái tại lúc tạo danh sách; trạng thái hiển thị thực tế nằm trong bảng media của Core và phải được kiểm trên từng database.
