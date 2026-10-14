# Hợp đồng API Member chỉ đọc — phạm vi tối thiểu Phase 1B

Trạng thái: phạm vi API Member chỉ đọc; hiện chưa có trường riêng nào của Member được duyệt để người dùng chỉnh sửa.

## Quyền sở hữu và lưu trữ dữ liệu

Identity (`users`, `user_roles` và `refresh_tokens`) tiếp tục là nguồn dữ liệu chính thức cho tài khoản, vai trò, trạng thái, thông tin xác thực và phiên đăng nhập. Member không sao chép hoặc thay đổi các dữ liệu này. Yêu cầu hiện tại chưa xác định trường nghiệp vụ bổ sung nào thuộc Member. Vì vậy, phạm vi này **không tạo bảng `member_profiles` rỗng hoặc migration**. API trả `profile: null`; các lệnh GET không thêm hoặc cập nhật dữ liệu.

> Không thêm đường dẫn PATCH hoặc DELETE, chức năng xóa tài khoản, hay các trường như số điện thoại, địa chỉ, ngày sinh, giới tính, ảnh đại diện hoặc phần giới thiệu nếu chưa có quyết định sản phẩm và hợp đồng được duyệt. Các công việc tạo migration và mô hình dữ liệu hồ sơ được hoãn cho đến khi có trường riêng của Member được duyệt để lưu trữ.

## Hồ sơ của người đang đăng nhập

`GET /api/v1/me/profile`

- Cần tài khoản ACTIVE đã xác thực; READER, LIBRARIAN và ADMIN đều chỉ xem được hồ sơ của chính mình.
- UUID đích chỉ lấy từ chủ thể JWT đang đăng nhập. Đường dẫn API không nhận user ID và không cho phép đổi phạm vi truy cập.
- Trả về `userId`, `memberCode`, `fullName`, `email`, `status` và `profile: null`.
- Tài khoản của chủ thể không tồn tại trả 401; tài khoản không còn ACTIVE trả 403.
- Chỉ đọc: không thêm hoặc cập nhật tài khoản, token, vai trò hay dữ liệu hồ sơ.

## Tìm kiếm thành viên dành cho nhân viên

`GET /api/v1/members`

- Chỉ LIBRARIAN và ADMIN được dùng. Yêu cầu chưa xác thực trả 401; READER trả 403.
- Kiểm tài khoản ACTIVE và vai trò hiện tại trong database trước khi đọc danh sách, ngoài kiểm role JWT. Tài khoản bị khóa/vô hiệu hóa hoặc đã mất role staff trả 403; chủ thể không còn tồn tại trả 401. Khi vừa được cấp role mới, cần token mới để qua kiểm role JWT.
- Dữ liệu lấy từ tài khoản Identity, bao gồm cả người chưa có dữ liệu hồ sơ riêng của Member.
- Mỗi phần tử chỉ gồm `userId`, `memberCode`, `fullName` và `status`. Không trả email, vai trò, dữ liệu mật khẩu hoặc token làm mới.
- Tham số `query` không bắt buộc, tìm theo `memberCode` hoặc `fullName` (loại khoảng trắng ở hai đầu, tối đa 150 ký tự; rỗng nghĩa là không lọc). Ký tự đại diện SQL được xử lý an toàn; dữ liệu đầu vào luôn được truyền dưới dạng tham số truy vấn.
- Tham số `status` không bắt buộc, chỉ nhận ACTIVE, LOCKED hoặc DISABLED.
- Phân trang: `page` mặc định là 0; `size` mặc định là 20, giới hạn từ 1 đến 100. Phản hồi dùng cấu trúc `{items, page:{number,size,totalElements,totalPages}}`.
- Chỉ cho phép sắp xếp theo `memberCode,asc|desc` hoặc `fullName,asc|desc`; mặc định `memberCode,asc`. UUID người dùng được dùng làm tiêu chí phụ để giữ thứ tự ổn định.
- Giá trị không hợp lệ trả 422. Không để lộ cú pháp SQL hoặc chi tiết lỗi SQL cho ứng dụng gọi API.

## Quyết định sản phẩm còn chờ

Phạm vi trên được bàn giao qua [PR #5](https://github.com/Shuuma4869/He-thong-quan-ly-va-khai-thac-thu-vien/pull/5), merge vào main ngày 12/10/2026. Nó thay thế kế hoạch cũ tạo bảng metadata riêng, endpoint members/me và tìm kiếm email. Không thêm alias hoặc tìm email trong Phase 1C.

Chỉ xem xét cho phép sửa hồ sơ sau khi sản phẩm duyệt rõ trường riêng của Member, mục đích, kiểu dữ liệu, quy tắc kiểm tra, quyền truy cập và thời hạn lưu trữ. Sau đó mới đề xuất migration và hợp đồng PATCH để nhóm rà soát. Các trường Identity (email, fullName, memberCode, status, vai trò, mật khẩu và token) không thuộc phạm vi chỉnh sửa Member.
