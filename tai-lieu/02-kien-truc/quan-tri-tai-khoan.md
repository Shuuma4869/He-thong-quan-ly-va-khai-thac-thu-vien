# Quản trị tài khoản

Trang **Nhân viên → Quản trị tài khoản** chỉ mở cho ADMIN. Thủ thư vẫn dùng danh sách thành viên chỉ đọc; hai API không dùng chung quyền xem email. Các thao tác quản trị nằm trong Identity, không ghi qua Member.

Quản trị viên có thể tra cứu theo mã, họ tên, email và trạng thái; xem chi tiết, khóa/mở tài khoản ACTIVE/LOCKED, cấp/thu hồi một trong ba vai trò hiện có và đọc 100 thay đổi gần nhất. API không trả mật khẩu, hash hay token. Từ khóa tìm kiếm được escape ký tự đại diện và truyền dưới dạng tham số SQL; danh sách sắp theo mã rồi UUID để phân trang ổn định.

Mỗi yêu cầu thay đổi cần `expectedVersion` và lý do 5–250 ký tự. Core kiểm lại trạng thái ACTIVE và vai trò ADMIN trong database, lấy khóa giao dịch cho nhóm thao tác quản trị, khóa dòng đích rồi so phiên bản. Nếu một người khác đã sửa trước, API trả 409 để giao diện tải lại; không ghi đè im lặng. Khóa hoặc thu hồi ADMIN của người quản trị hoạt động cuối cùng bị từ chối. Một tài khoản luôn cần ít nhất một vai trò. Thay đổi thành công tăng `admin_version` và `credential_version`, thu hồi refresh token và ghi `account_admin_audit` trong cùng transaction. Access JWT cũ bị từ chối ngay ở lần gọi tiếp theo. Nếu quản trị viên sửa chính mình, giao diện đưa về đăng nhập.

Trạng thái DISABLED hiện chỉ đọc trên trang này; hệ thống chưa có quy trình vô hiệu hóa hoặc xóa tài khoản. Audit lưu UUID người thao tác/đích, thay đổi vai trò hoặc trạng thái, lý do và thời điểm. Chưa chốt thời hạn lưu hoặc xóa dữ liệu production; chính sách đó cần đơn vị vận hành phê duyệt trước khi viết job purge. Khóa giao dịch dùng PostgreSQL advisory lock cho các thay đổi hiếm gặp; nếu chuyển database hoặc triển khai quy mô lớn phải đánh giá lại cơ chế này.

Kiểm thử `AdminAccountIntegrationTest` chạy PostgreSQL thật cho quyền Reader, tìm kiếm, phiên cũ, audit, xung đột phiên bản, hai Admin cập nhật đồng thời và bảo vệ Admin cuối. `AdminAccountsPage.test.tsx` kiểm quyền giao diện và payload thay đổi. Kết quả chỉ áp dụng cho commit/test run được ghi riêng trong hồ sơ kiểm thử.
