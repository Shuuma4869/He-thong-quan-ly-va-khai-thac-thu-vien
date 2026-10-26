# Design System Foundation

## Trang chủ và không gian thư viện

Trang `/` dùng header ngang, hero ảnh thư viện, thanh tìm kiếm đặt lên mép dưới hero, các khối thể loại và sách lấy từ Core, lời mời tạo tài khoản và footer. Ảnh hero là ảnh thư viện do nhóm cung cấp, lưu tại `frontend/src/assets/img/auth/auth-cover-library.webp`; nguồn ghi ở footer: Olga Lioncat / Pexels. File đã được thu về 1920 × 1280 và nén WebP để giảm tải trang. Trước khi phát hành công khai cần giữ lại thông tin nguồn ảnh trong hồ sơ tài sản của nhóm.

Trang danh mục và các trang sau đăng nhập dùng sidebar trái rộng 258px từ 1024px. Dưới mốc đó, sidebar chuyển thành drawer; Escape đóng và trả focus về nút mở. Menu chỉ gồm route đã có và được phân theo khách, Reader, nhân viên. Header nội dung giữ ô tìm sách, tài khoản và lối vào khu nhân viên để tránh lặp menu. Card sách dùng tỷ lệ bìa 3:4; khi Core chưa có ảnh được duyệt thì hiện bìa chữ, không tạo ảnh thay thế từ ISBN.

Danh sách công khai dùng `/public/catalog/*`. Core chỉ đưa bìa của ấn bản có ảnh được nhân viên duyệt, chọn năm xuất bản mới nhất rồi UUID để ổn định khi cùng năm. Điểm trung bình và số lượt đánh giá lấy trực tiếp từ bảng review theo cả trang; chưa có đánh giá thì card không hiện điểm. Trạng thái yêu thích của tài khoản đăng nhập được đọc bằng một yêu cầu batch riêng, không lẫn vào dữ liệu công khai. Payload không có người duyệt, dữ liệu thành viên hoặc tình trạng mượn. Đây là danh mục thư mục công khai để tra cứu; người dùng vẫn cần đăng nhập khi lưu sách, đánh giá, mượn hoặc giữ chỗ. Nếu đơn vị thư viện có hạn chế công bố biên mục, cần xác nhận danh mục được phép public trước khi đưa lên môi trường production.

Core giới hạn danh mục công khai 300 lượt/phút theo IP kết nối, lưu cửa sổ đếm trong bộ nhớ của từng instance. Chưa dùng `X-Forwarded-For` từ client. Trước pilot qua reverse proxy nhiều người dùng, cần cấu hình proxy đáng tin cậy và đo lại để tránh nhiều người cùng chia một hạn mức.

## React-Bootstrap trong luồng biên mục

MetadataHistory dùng Form/Button/Alert/Spinner thực tế. CSS chỉ dưới `.metadata-history`, không import Bootstrap Reboot để tránh phá Tailwind 4 và Auth layout. Lazy-load vùng này khi mở để không đưa toàn bộ component Bootstrap vào bundle đầu. Kiểm focus-visible, keyboard, reduced motion, wrap trên mobile theo [wireframes](wireframes.md); không tự kết luận nghiệm thu trực quan chỉ từ component tests.

## Visual language

Giao diện dùng khoảng thở rộng, nền sáng và đường viền nhẹ. Tiêu đề trang, tên sách và các khối giới thiệu ưu tiên `Segoe UI` trên Windows, rồi tới Arial và font hệ thống. Phần chữ còn lại khai báo `Inter` với font hệ thống dự phòng; repository không đóng gói Inter nên hình dáng chữ có thể khác giữa các máy. Đã bỏ kiểu chữ Georgia ở tên sách để dấu tiếng Việt không bị ngắt rời; bìa chữ khi thiếu ảnh vẫn dùng Georgia như một chi tiết trang trí.

| Token | Giá trị |
|---|---|
| canvas / surface / muted | `#F6F8F7` / `#FFFFFF` / `#F0F4F2` |
| text / muted / border | `#17211F` / `#66736F` / `#E1E8E5` |
| primary / hover / soft | `#0F766E` / `#115E59` / `#CCFBF1` |
| link / success / warning / danger | `#2563EB` / `#15803D` / `#B45309` / `#B91C1C` |

Type: body 15–16px, label 14px, helper 13px, section 20–22px, page 28–32px. Spacing dựa trên 4px; radius chủ đạo 10–14px; shadow chỉ phân lớp nhẹ.

## Motion và responsive

Hover khoảng 160–200ms. Form đăng nhập xuất hiện trong 220ms; bộ chọn tham chiếu, nền phủ và drawer có hiệu ứng ngắn. Danh sách sách dùng skeleton khi tải. `prefers-reduced-motion` rút ngắn animation và transition trên toàn ứng dụng. Giao diện bắt đầu từ 320px; login chuyển một cột dưới 900px. Các bảng dữ liệu vẫn cần được kiểm tra theo từng nghiệp vụ trên màn hình hẹp; hiện chưa có hệ thống toast hay chuyển động spring dùng chung.

## Accessibility

Các input và nút chính có focus nhìn rõ; drawer đóng bằng Escape và trả focus về nút mở. Bộ chọn tác giả/thể loại/sách hỗ trợ phím mũi tên, Enter và Escape. Lỗi, trạng thái tải và danh sách trống đều có chữ mô tả. Chưa có kết quả đo contrast và kích thước mục tiêu chạm trên toàn bộ màn hình, nên không coi phần này là chứng nhận WCAG.

## Kiểm tra giao diện

Lượt kiểm tra local ngày 26/10/2026 dùng dữ liệu Catalog đã seed và API Core thật. Trang chủ và danh mục được chụp ở 320, 390, 768 và 1440px; trang chi tiết sách ở desktop/mobile; danh sách tác giả ở desktop. Các màn đã kiểm không tràn ngang. Lỗi tên sách tiếng Việt bị bẻ giữa từ và trang tác giả kẹt ở trạng thái tải đã được sửa trong lượt này. Bộ Web E2E và EXE E2E còn kiểm trang chủ, danh mục ở 390, 768, 1024 và 1440px bằng cùng dữ liệu thử nghiệm cô lập. Ảnh chụp E2E nằm trong `frontend/test-results/` local, không được đưa vào Git.

Phạm vi trên chưa bao gồm đo tốc độ trên máy cấu hình thấp, kiểm bằng screen reader, toàn bộ form nhân viên ở mức zoom cao hoặc ảnh bìa thật đã duyệt. Khi thay CSS hoặc component liên quan, chạy lại hành trình Web/EXE và kiểm ít nhất các kích thước trên; không dùng kết quả lượt này cho một commit khác chưa được thử.

## Quy tắc copy tiếng Việt

Mặc định `vi-VN`; câu ngắn, trực tiếp, không sáo rỗng. Button dùng động từ (“Lưu thay đổi”), empty state nói đúng nguyên nhân và hành động tiếp theo. Identifier kỹ thuật dùng tiếng Anh; comment business có ích dùng tiếng Việt.
