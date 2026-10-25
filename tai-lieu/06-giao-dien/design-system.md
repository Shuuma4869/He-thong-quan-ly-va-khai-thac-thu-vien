# Design System Foundation

## Trang chủ và không gian thư viện

Trang `/` dùng header ngang, hero ảnh thư viện, thanh tìm kiếm đặt lên mép dưới hero, các khối thể loại và sách lấy từ Core, lời mời tạo tài khoản và footer. Ảnh hero là ảnh thư viện do nhóm cung cấp, lưu tại `frontend/src/assets/img/auth/auth-cover-library.jpg`; nguồn ghi ở footer: Olga Lioncat / Pexels. Trước khi phát hành công khai cần giữ lại thông tin nguồn ảnh trong hồ sơ tài sản của nhóm.

Trang danh mục và các trang sau đăng nhập dùng sidebar trái rộng 258px từ 1024px. Dưới mốc đó, sidebar chuyển thành drawer; Escape đóng và trả focus về nút mở. Menu chỉ gồm route đã có và được phân theo khách, Reader, nhân viên. Header nội dung giữ ô tìm sách, tài khoản và lối vào khu nhân viên để tránh lặp menu. Card sách dùng tỷ lệ bìa 3:4; khi Core chưa có ảnh được duyệt thì hiện bìa chữ, không tạo ảnh thay thế từ ISBN.

Danh sách công khai dùng `/public/catalog/*`. Core chỉ đưa bìa của ấn bản có ảnh được nhân viên duyệt, chọn năm xuất bản mới nhất rồi UUID để ổn định khi cùng năm. Điểm trung bình và số lượt đánh giá lấy trực tiếp từ bảng review theo cả trang; chưa có đánh giá thì card không hiện điểm. Trạng thái yêu thích của tài khoản đăng nhập được đọc bằng một yêu cầu batch riêng, không lẫn vào dữ liệu công khai. Payload không có người duyệt, dữ liệu thành viên hoặc tình trạng mượn. Đây là danh mục thư mục công khai để tra cứu; người dùng vẫn cần đăng nhập khi lưu sách, đánh giá, mượn hoặc giữ chỗ. Nếu đơn vị thư viện có hạn chế công bố biên mục, cần xác nhận danh mục được phép public trước khi đưa lên môi trường production.

Core giới hạn danh mục công khai 300 lượt/phút theo IP kết nối, lưu cửa sổ đếm trong bộ nhớ của từng instance. Chưa dùng `X-Forwarded-For` từ client. Trước pilot qua reverse proxy nhiều người dùng, cần cấu hình proxy đáng tin cậy và đo lại để tránh nhiều người cùng chia một hạn mức.

## React-Bootstrap trong luồng biên mục

MetadataHistory dùng Form/Button/Alert/Spinner thực tế. CSS chỉ dưới `.metadata-history`, không import Bootstrap Reboot để tránh phá Tailwind 4 và Auth layout. Lazy-load vùng này khi mở để không đưa toàn bộ component Bootstrap vào bundle đầu. Kiểm focus-visible, keyboard, reduced motion, wrap trên mobile theo [wireframes](wireframes.md); không tự kết luận nghiệm thu trực quan chỉ từ component tests.

## Visual language

Modern Editorial + SaaS Dashboard: khoảng thở rõ, surface trắng, border nhẹ; Newsreader chỉ cho tiêu đề mang tính đọc, Inter cho form/dashboard.

| Token | Giá trị |
|---|---|
| canvas / surface / muted | `#F6F8F7` / `#FFFFFF` / `#F0F4F2` |
| text / muted / border | `#17211F` / `#66736F` / `#E1E8E5` |
| primary / hover / soft | `#0F766E` / `#115E59` / `#CCFBF1` |
| link / success / warning / danger | `#2563EB` / `#15803D` / `#B45309` / `#B91C1C` |

Type: body 15–16px, label 14px, helper 13px, section 20–22px, page 28–32px. Spacing dựa trên 4px; radius chủ đạo 10–14px; shadow chỉ phân lớp nhẹ.

## Motion và responsive

Hover khoảng 180ms, page enter 220ms, modal/drawer dùng spring nhẹ, toast slide + fade. `prefers-reduced-motion` tắt chuyển động không thiết yếu. Mobile bắt đầu từ 320px; login một cột dưới 900px; bảng phải có phương án scroll/card.

## Accessibility

Focus nhìn rõ; label thật cho input; lỗi liên kết bằng ARIA; contrast AA; target tối thiểu khoảng 44px; không truyền nghĩa chỉ bằng màu; dialog quản lý focus và Escape.

## Quy tắc copy tiếng Việt

Mặc định `vi-VN`; câu ngắn, trực tiếp, không sáo rỗng. Button dùng động từ (“Lưu thay đổi”), empty state nói đúng nguyên nhân và hành động tiếp theo. Identifier kỹ thuật dùng tiếng Anh; comment business có ích dùng tiếng Việt.
