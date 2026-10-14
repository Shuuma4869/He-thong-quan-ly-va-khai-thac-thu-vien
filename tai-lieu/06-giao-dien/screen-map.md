# Screen Map

| Khu vực | Màn hình | Giai đoạn |
|---|---|---|
| Public | Đăng nhập, đăng ký, 404 | Đã có |
| Reader | Home | Đã có |
| Reader/Staff/Admin | Profile chỉ đọc | Đã triển khai Phase 1C; API /me/profile |
| Reader | Discover, Book Detail, Author Detail, My Library, Loans, Holds, History, Favorites, Reviews, Notifications | MVP |
| Staff | Dashboard | Đã có; yêu cầu quyền nhân viên |
| Staff | Danh sách thành viên, tìm/lọc/sort/phân trang | Đã triển khai Phase 1C; API /members |
| Staff | Circulation Desk, Hold Queue, Catalog, Copies, Inventory | MVP |
| Admin | Users/Roles, Policies, Audit, Settings | MVP |
| Admin | Analytics, Acquisition | Advanced |
| Reader | Semantic suggestions, alternative edition ETA | Advanced |

Route hiện có `/`, `/dang-nhap`, `/dang-ky`, `/ho-so`, `/nhan-vien/bang-dieu-khien`, `/nhan-vien/thanh-vien` và trang 404. Profile yêu cầu đăng nhập; route nhân viên chỉ cho `LIBRARIAN` hoặc `ADMIN`. Bộ lọc Member đồng bộ query/status/page/size/sort với URL, hỗ trợ back/forward và reload. Profile không có nút sửa; Member List không có thao tác đổi trạng thái hoặc xóa tài khoản. Những màn hình nghiệp vụ khác vẫn thuộc kế hoạch.
