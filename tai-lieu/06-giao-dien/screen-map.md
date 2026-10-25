# Screen Map

Staff Catalog có vùng “Lịch sử tra cứu ISBN” (không route mới), owner-scoped list/filter/page/save/replay/delete. React-Bootstrap chỉ trong vùng này, CSS scoped không Reboot toàn cục. [Wireframe W5](wireframes.md) mô tả bố cục.

| Khu vực | Màn hình | Giai đoạn |
|---|---|---|
| Public | Landing `/`, đăng nhập, đăng ký, 404 | Landing dùng ảnh thư viện và danh mục Core thật; các trang còn lại đã có |
| Reader/Staff/Admin | Profile chỉ đọc | Đã triển khai Phase 1C; API /me/profile |
| Reader/Staff/Admin | Catalog list/filter, Book Detail và Author Detail | Phase 2 đọc API Core thật; Phase 6 thêm tìm kiếm xếp hạng/không dấu |
| Reader/Staff/Admin | My Library: Favorites và Reviews của mình; Review/Rating trong Book Detail | Phase 3; `/thu-vien-cua-toi`, Core API thật |
| Reader | Loans, Holds, History mượn trả | `/muon-va-giu-cho` đã có; thông báo mới lưu nội bộ tại Insight, chưa có hộp thư UI |
| Staff | Dashboard | Đã có; yêu cầu quyền nhân viên |
| Staff | Danh sách thành viên, tìm/lọc/sort/phân trang | Đã triển khai Phase 1C; API /members |
| Staff | Catalog quản lý Author/Category/Publisher/Book/Edition/Branch/Shelf/Copy; duyệt ảnh | Phase 2 |
| Staff | Circulation Desk, Hold Queue | `/nhan-vien/luu-thong` đã có |
| Staff | Kiểm kê kệ, scan và rà soát bất thường | `/nhan-vien/kiem-ke` và `/nhan-vien/kiem-ke/:sessionId`; dùng Core API, chưa có camera/offline |
| Admin | Users/Roles, Policies, Audit, Settings | MVP |
| Admin | Analytics, Acquisition | Advanced |
| Reader | Semantic suggestions, alternative edition ETA | Advanced |

Route hiện có `/`, `/dang-nhap`, `/dang-ky`, `/ho-so`, `/thu-vien-cua-toi`, `/muon-va-giu-cho`, `/sach`, `/sach/:bookId`, `/tac-gia/:authorId`, `/nhan-vien/bang-dieu-khien`, `/nhan-vien/thanh-vien`, `/nhan-vien/danh-muc`, `/nhan-vien/luu-thong`, `/nhan-vien/bao-cao-luu-thong`, `/nhan-vien/kiem-ke`, `/nhan-vien/kiem-ke/:sessionId` và trang 404. Catalog và trang tác phẩm/tác giả đọc được khi chưa đăng nhập qua projection công khai; Profile/My Library yêu cầu đăng nhập; route nhân viên chỉ cho `LIBRARIAN` hoặc `ADMIN`. Bộ lọc Member/Catalog giữ state trong URL. Book Detail tách Edition; không hiển thị số bản sẵn có giả. Profile vẫn chỉ đọc.
