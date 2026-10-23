# Screen Map

Staff Catalog bổ sung vùng “Lịch sử tra cứu ISBN” (không route mới), owner-scoped list/filter/page/save/replay/delete. React-Bootstrap chỉ trong vùng này, CSS scoped không Reboot toàn cục. [Wireframe W5](wireframes.md) mô tả bố cục; nghiệm thu runtime còn phải kiểm PostgreSQL/E2E.

| Khu vực | Màn hình | Giai đoạn |
|---|---|---|
| Public | Đăng nhập, đăng ký, 404 | Đã có |
| Reader | Home | Đã có |
| Reader/Staff/Admin | Profile chỉ đọc | Đã triển khai Phase 1C; API /me/profile |
| Reader/Staff/Admin | Catalog list/filter, Book Detail và Author Detail | Phase 2; đọc API Core thật |
| Reader/Staff/Admin | My Library: Favorites và Reviews của mình; Review/Rating trong Book Detail | Phase 3; `/thu-vien-cua-toi`, Core API thật |
| Reader | Loans, Holds, History mượn trả, Notifications | Chưa triển khai |
| Staff | Dashboard | Đã có; yêu cầu quyền nhân viên |
| Staff | Danh sách thành viên, tìm/lọc/sort/phân trang | Đã triển khai Phase 1C; API /members |
| Staff | Catalog quản lý Author/Category/Publisher/Book/Edition/Branch/Shelf/Copy; duyệt ảnh | Phase 2 |
| Staff | Circulation Desk, Hold Queue, Inventory session | Chưa triển khai |
| Admin | Users/Roles, Policies, Audit, Settings | MVP |
| Admin | Analytics, Acquisition | Advanced |
| Reader | Semantic suggestions, alternative edition ETA | Advanced |

Route hiện có `/`, `/dang-nhap`, `/dang-ky`, `/ho-so`, `/thu-vien-cua-toi`, `/sach`, `/sach/:bookId`, `/tac-gia/:authorId`, `/nhan-vien/bang-dieu-khien`, `/nhan-vien/thanh-vien`, `/nhan-vien/danh-muc` và trang 404. Profile/Catalog/My Library yêu cầu đăng nhập; route nhân viên chỉ cho `LIBRARIAN` hoặc `ADMIN`. Bộ lọc Member/Catalog giữ state trong URL, hỗ trợ back/forward/reload. Book Detail tách Edition; không hiển thị số bản sẵn có giả. Profile vẫn chỉ đọc. Các route nghiệp vụ roadmap khác chưa có trang thực thi.
