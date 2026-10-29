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

Ô tìm kiếm chung trên topbar gợi ý sách, tác giả và thể loại từ Core. Màn hẹp có nút tìm kiếm mở hộp thoại riêng, tự focus, giữ nền không tương tác và trả focus khi đóng. Mỗi nhóm lấy tối đa bốn mục; người dùng có thể dùng mũi tên, Enter, Escape hoặc Ctrl+K. Catalog vẫn phân trang trên server, không tải toàn bộ 10.000 tác phẩm về trình duyệt.

Card sách ưu tiên bìa ấn bản đã duyệt. Danh sách tác giả chỉ hiện chân dung đã duyệt. Thể loại ưu tiên bìa đã duyệt của sách thuộc thể loại đó; khi thiếu bìa, 12 ảnh chủ đề đã ánh xạ và ảnh bàn đọc cho văn học được dùng với nhãn minh họa; nhóm khác dùng một trong ba cảnh đọc chung. Không gán ảnh chủ đề thành ảnh bìa thật. Trang đầu Catalog dùng ảnh sách trên bàn; trang tác giả/thể loại có ảnh không gian đọc; trang chủ có thêm ảnh góc đọc. Các ảnh biên tập không đại diện cho bản ghi Catalog. Thông tin nguồn/giấy phép đi cùng ảnh thật theo [quy trình media](../03-du-lieu/media-strategy.md) và [bảng nguồn ảnh](nguon-anh.md).

Danh mục công khai chỉ trả bìa đã được duyệt, đánh giá tổng hợp và metadata Book. Trạng thái yêu thích của từng tài khoản được đọc bằng một request riêng. Core giới hạn danh mục công khai 300 lượt/phút theo IP kết nối, đếm trong bộ nhớ từng instance. Khi triển khai sau reverse proxy, cần xác định IP nguồn đáng tin cậy và đo lại hạn mức vì nhiều người dùng có thể dùng chung một địa chỉ.

Màn tra cứu ISBN dùng React-Bootstrap trong phạm vi `.metadata-history`; không import Bootstrap Reboot lên toàn ứng dụng. Vùng này được lazy-load khi mở để giảm bundle đầu.

## Phạm vi hiện có

Reader có Catalog, My Library, đánh giá và Account Center. Staff dùng cùng topbar/sidebar nhưng có bảng điều khiển, quầy lưu thông, kiểm kê và các màn quản trị theo quyền. Bảng điều khiển đọc số tác phẩm, bản sách, phiên kiểm kê, lượt đang mượn/quá hạn và đề xuất DRAFT từ API. Biểu đồ giữ chỗ tổng hợp sự kiện 30 ngày gần đây, không phải số yêu cầu đang chờ; mỗi nguồn được đọc độc lập, không tạo thành snapshot toàn hệ thống. Admin có thêm đường vào quản lý tài khoản và báo cáo đánh giá. Email mới chỉ trở thành email đăng nhập sau khi nhập mã gửi tới hộp thư mới; khi SMTP chưa bật, giao diện nói rõ tính năng tạm chưa khả dụng.

## Kiểm tra giao diện

Lượt kiểm tra local ngày 27/10/2026 dùng cùng Core và dữ liệu Catalog demo để chụp giao diện trước/sau ở 390, 768, 1024, 1366, 1440, 1536 và 1920 px. Các màn đã kiểm không tràn ngang. Trước thay đổi, topbar của Catalog cuộn theo trang và ba mục cùng đường dẫn trong sidebar cùng được tô sáng; sau thay đổi topbar bám đầu, mỗi URL chỉ có một mục active. Ba sách yêu thích của tài khoản demo trước đây hiện thành ba ô tên sách; bản mới dùng Book Card có tác giả, bìa chữ khi thiếu ảnh và hành động tương ứng. Ảnh chụp kiểm tra nằm trong `.tools/premium-before-images/` và `.tools/premium-visual/` ở máy local, không phải asset cần commit.

Ở lượt kiểm tra ngày 27/10/2026, Web và EXE E2E chạy 17 ca trên PostgreSQL cô lập; bài test Search kiểm phím tắt, gợi ý thật, điều hướng hash, sidebar và back-to-top khi bật reduced motion. Đây không phải chứng nhận WCAG: screen reader, tương phản mọi trạng thái và toàn bộ form nhân viên ở mức zoom cao chưa được nghiệm thu.

Mặc định dùng câu tiếng Việt ngắn, nút có động từ và trạng thái trống giải thích được nguyên nhân. Dữ liệu chưa có nguồn được ghi là chưa có, không tạo số liệu hoặc ảnh giả để làm đầy giao diện.

## Điều hướng ấn bản và phản hồi thao tác

Nút “Xem ấn bản và giữ chỗ” cuộn và chuyển focus tới danh sách ấn bản trong cùng trang. Không dùng neo `href="#..."` ở đây vì bản desktop dùng HashRouter. Mỗi ấn bản dẫn tới form giữ chỗ và chọn chi nhánh nhận; thao tác cho mượn thực hiện tại quầy. Tác phẩm tham khảo chưa có ấn bản vật lý phải hiển thị đúng trạng thái thiếu dữ liệu, không tạo tồn kho giả.

Khi đóng hoặc hủy phiên kiểm kê, giao diện cập nhật trạng thái từ biên nhận máy chủ trước khi tải lại các danh sách liên quan. Yêu cầu mất phản hồi vẫn giữ cùng mã để thử lại an toàn. Tải lại dữ liệu chậm không được giữ nút ở trạng thái đang xử lý sau khi đã nhận kết quả thành công.

Nền ứng dụng phối hồng nhạt và xanh, các panel kính có viền sáng và bóng đổ để tách lớp nội dung. Banner tác giả và thể loại dùng ảnh phủ toàn khung với lớp tối phía chữ. Sidebar thu gọn phản hồi ngay, sau đó lưu thiết lập; nếu lưu thất bại thì khôi phục trạng thái trước đó. Drawer giữ trong DOM để chạy được cả hiệu ứng mở và đóng, nhưng ở trạng thái đóng có `inert` và `aria-hidden`. Chuyển trang dùng opacity và translate ngắn; thiết lập giảm chuyển động của ứng dụng và hệ điều hành vẫn được ưu tiên.

## Bề mặt vận hành và trạng thái người dùng

`appearance.css` sở hữu token màu, khoảng cách, độ trong và chuyển động; `premium.css` giữ bố cục nền, `library-theme.css` giữ cấu trúc thư viện và `index.css` chứa reset/tiện ích chung. Form, bảng và vùng đọc dài dùng nền đặc; blur tập trung ở thanh điều hướng và bề mặt nổi. Không chồng thêm blur trên từng ô dữ liệu. Các lựa chọn màu chỉ đổi token đã định nghĩa.

Bản xem thử Appearance giữ nguyên khi chuyển route rồi quay lại. Lưu thất bại giữ bản thử để người dùng sửa hoặc bỏ; phản hồi của phiên cũ không được ghi đè thiết lập sau khi đổi tài khoản, kể cả A → B → A. Tab khác chỉ thông báo khi có bản mới và không âm thầm xóa bản thử đang sửa. Hiện có ẩn/hiện nhóm widget; thứ tự nhóm giữ cố định, chưa có kéo thả.

Chuông thông báo kiểm số chưa đọc mỗi 60 giây khi ở foreground, dùng cache 30 giây. Chỉ mở hộp thoại mới tải danh sách, hiển thị tối đa năm thông báo; xem nhanh không tự đánh dấu đã đọc. My Library lấy trang đầu của lượt mượn và giữ chỗ, hiển thị tối đa ba mục mỗi nhóm rồi dẫn tới trang đầy đủ.

Báo cáo giữ chỗ có kỳ [từ ngày, đến ngày), chi nhánh và tác phẩm; ngày nhập theo giờ Việt Nam, giới hạn sáu tháng lịch kiểm theo UTC như server. Bảng chia 50 nhóm mỗi trang trên kết quả tối đa 10.000 nhóm. CSV dùng cùng bộ lọc đã áp dụng nhưng đọc lại dữ liệu tại lúc tải. Trạng thái chưa chọn kỳ, không có sự kiện và lỗi API được trình bày riêng.
