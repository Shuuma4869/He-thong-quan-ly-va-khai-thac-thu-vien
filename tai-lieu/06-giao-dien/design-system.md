# Hệ thống giao diện LAMS

Giao diện web và ứng dụng Windows dùng cùng bộ React. Trang giới thiệu giữ header, ảnh thư viện, tìm kiếm và các khối nội dung theo đề bài. Ảnh hero do nhóm cung cấp, ghi nguồn Olga Lioncat / Pexels ở footer. Phần ứng dụng dùng `frontend/src/styles/premium.css`; lớp `frontend/src/styles/appearance.css` bổ sung bề mặt sáng, thanh điều hướng nổi và các preset cá nhân. Nguồn ảnh mới nằm trong [bảng nguồn ảnh](nguon-anh.md).

## Màu và chữ

Nội dung đặt trên bề mặt trắng có độ trong vừa phải; nền bao quanh có sắc xanh nhạt. Mặc định nút và liên kết dùng xanh dương `#126C97`. Người dùng có thể chọn thêm xanh ngọc, xanh trời, lục bảo hoặc cát ấm. Mỗi lựa chọn ánh xạ tới biến CSS cố định trong `appearance.css`; ứng dụng không nhận màu CSS hay URL tùy ý từ API.

Be Vietnam Pro là font chính cho điều hướng, bảng, form và nội dung tiếng Việt. Literata dùng cho tên sách ở card và trang chi tiết. Font được đóng gói trong bản build, nên EXE không cần tải font từ Internet. Tiêu đề trang dùng sans để giữ độ rõ ở các màn nghiệp vụ.

## Bố cục và chuyển động

Sidebar desktop rộng 224 px khi mở, 76 px khi thu gọn. Mặc định nó tách khỏi khung nội dung bằng khoảng hở 18 px; người dùng có thể chọn bố cục cổ điển liền khối. Trên màn hẹp sidebar thành drawer, giữ nút đóng, Escape và vòng focus khi dùng Tab. Topbar bám đầu trang. Nội dung giới hạn tối đa 1640 px, còn lưới thẻ sách ở 390 px chuyển thành card ngang để tên sách không bị ép quá nhỏ.

Trang `/cai-dat/giao-dien` cho xem trước trực tiếp màu nhấn, độ trong, blur, kiểu và trạng thái sidebar, mật độ, bo góc, cỡ chữ, chuyển động, kiểu thẻ sách và các khối trên bảng điều khiển nhân viên. Người dùng có thể lưu, bỏ thay đổi hoặc khôi phục mặc định. Khách chưa đăng nhập lưu trong `localStorage` của trình duyệt. Tài khoản đã đăng nhập lưu tại Core trong bảng `user_ui_preferences`, với `schema_version=1`, revision chống ghi đè bản mới và khóa ngoại xóa theo tài khoản. API chỉ nhận preset đã liệt kê trong OpenAPI; phản hồi 409 khi revision cũ và 422 khi giá trị không hợp lệ. Nếu API không sẵn sàng, giao diện dùng preset mặc định và báo lỗi, không đọc nhầm thiết lập của tài khoản khác.

Chuyển động ngắn dùng ba mốc 140, 220 và 320 ms, chủ yếu cho sidebar, popover và trạng thái hover. Tùy chọn giảm hoặc tắt chuyển động áp dụng cho cả trang; yêu cầu giảm chuyển động của hệ điều hành luôn được tôn trọng. Nút quay về đầu trang dùng cuộn tức thời khi hệ điều hành yêu cầu.

## Tìm kiếm và hình ảnh

Ô tìm kiếm chung trên topbar gợi ý sách, tác giả và thể loại từ Core. Mỗi nhóm lấy tối đa bốn mục; người dùng có thể dùng mũi tên, Enter, Escape hoặc Ctrl+K. Catalog vẫn phân trang trên server, không tải toàn bộ 10.000 tác phẩm về trình duyệt.

Card sách ưu tiên bìa ấn bản đã duyệt. Danh sách tác giả chỉ hiện chân dung đã duyệt. Thể loại ưu tiên bìa đã duyệt của sách thuộc thể loại đó; khi thiếu bìa, sáu nhóm chủ đề đã ánh xạ dùng ảnh minh họa có nhãn riêng, nhóm khác dùng visual chữ. Không gán ảnh chủ đề thành ảnh bìa thật. Trang đầu Catalog dùng ảnh sách trên bàn; trang tác giả/thể loại có ảnh không gian đọc; trang chủ có thêm ảnh góc đọc. Các ảnh biên tập không đại diện cho bản ghi Catalog. Thông tin nguồn/giấy phép đi cùng ảnh thật theo [quy trình media](../03-du-lieu/media-strategy.md) và [bảng nguồn ảnh](nguon-anh.md).

Danh mục công khai chỉ trả bìa đã được duyệt, đánh giá tổng hợp và metadata Book. Trạng thái yêu thích của từng tài khoản được đọc bằng một request riêng. Core giới hạn danh mục công khai 300 lượt/phút theo IP kết nối, đếm trong bộ nhớ từng instance. Khi triển khai sau reverse proxy, cần xác định IP nguồn đáng tin cậy và đo lại hạn mức vì nhiều người dùng có thể dùng chung một địa chỉ.

Màn tra cứu ISBN dùng React-Bootstrap trong phạm vi `.metadata-history`; không import Bootstrap Reboot lên toàn ứng dụng. Vùng này được lazy-load khi mở để giảm bundle đầu.

## Phạm vi hiện có

Reader có Catalog, My Library, đánh giá và Account Center. Staff dùng cùng topbar/sidebar nhưng có bảng điều khiển, quầy lưu thông, kiểm kê và các màn quản trị theo quyền. Bảng điều khiển chỉ hiện số liệu lấy từ API; chưa có feed hoạt động hay biểu đồ vì chưa có nguồn dữ liệu tương ứng. Email mới chỉ trở thành email đăng nhập sau khi nhập mã gửi tới hộp thư mới; khi SMTP chưa bật, giao diện nói rõ tính năng tạm chưa khả dụng.

## Kiểm tra giao diện

Lượt kiểm tra local ngày 27/10/2026 dùng cùng Core và dữ liệu Catalog demo để chụp giao diện trước/sau ở 390, 768, 1024, 1366, 1440, 1536 và 1920 px. Các màn đã kiểm không tràn ngang. Trước thay đổi, topbar của Catalog cuộn theo trang và ba mục cùng đường dẫn trong sidebar cùng được tô sáng; sau thay đổi topbar bám đầu, mỗi URL chỉ có một mục active. Ba sách yêu thích của tài khoản demo trước đây hiện thành ba ô tên sách; bản mới dùng Book Card có tác giả, bìa chữ khi thiếu ảnh và hành động tương ứng. Ảnh chụp kiểm tra nằm trong `.tools/premium-before-images/` và `.tools/premium-visual/` ở máy local, không phải asset cần commit.

Web và EXE E2E chạy 17 ca trên PostgreSQL cô lập; bài test Search kiểm phím tắt, gợi ý thật, điều hướng hash, sidebar và back-to-top khi bật reduced motion. Đây không phải chứng nhận WCAG: screen reader, tương phản mọi trạng thái và toàn bộ form nhân viên ở mức zoom cao chưa được nghiệm thu.

Mặc định dùng câu tiếng Việt ngắn, nút có động từ và trạng thái trống giải thích được nguyên nhân. Dữ liệu chưa có nguồn được ghi là chưa có, không tạo số liệu hoặc ảnh giả để làm đầy giao diện.
