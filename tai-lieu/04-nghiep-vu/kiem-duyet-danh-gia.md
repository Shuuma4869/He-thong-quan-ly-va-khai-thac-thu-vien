# Báo cáo và kiểm duyệt đánh giá

Người đọc đã đăng nhập có thể báo cáo đánh giá của người khác từ trang sách. Lý do phải dài 10–500 ký tự. Một tài khoản chỉ gửi một báo cáo cho mỗi đánh giá và tối đa 20 báo cáo trong 24 giờ. Không nhận báo cáo đối với đánh giá đã ẩn. Nội dung và điểm số được chụp lại lúc gửi, vì tác giả vẫn có thể sửa hoặc xóa đánh giá về sau.

Hàng đợi `/api/v1/admin/review-reports` chỉ dành cho tài khoản đang hoạt động và còn vai trò `ADMIN` trong database. Thủ thư không có quyền này. Quản trị viên xem ảnh chụp và chọn ẩn đánh giá hoặc bác báo cáo, kèm lý do 10–500 ký tự. Mỗi báo cáo chỉ được quyết định một lần; quyết định được lưu trong `review_moderation_audit`. Khi ẩn, đánh giá không còn trong danh sách và không được tính vào điểm trung bình ở cả API review lẫn catalog công khai. Bác báo cáo giữ nguyên đánh giá. Hành động này không tự khóa tài khoản tác giả.

Chủ đánh giá vẫn thấy bản ghi đã ẩn trong “Thư viện của tôi” và trên phần quản lý đánh giá, kèm trạng thái. Họ có thể sửa hoặc xóa bản ghi của mình; sửa không tự công khai lại. Hiện chưa có quy trình kháng nghị hoặc phục hồi review đã ẩn. Nếu chủ sở hữu xóa rồi viết đánh giá mới, hệ thống xem đó là bản ghi mới; cần chính sách xử lý lặp lại vi phạm trước khi vận hành rộng.

Hai quyết định đồng thời trên một báo cáo được tuần tự hóa bằng khóa hàng. Nếu tác giả đã xóa đánh giá, quản trị viên có thể bác báo cáo và ghi lý do, nhưng không thể thực hiện lệnh ẩn. Ảnh chụp báo cáo và audit vẫn tồn tại để giải thích quyết định. API không trả danh tính người báo cáo cho trang người đọc.

Review và lý do báo cáo có thể chứa dữ liệu cá nhân do người dùng tự nhập. Hiện hệ thống **chưa có lịch xóa tự động** cho báo cáo hoặc audit. Bảng giữ khóa ngoại tới tài khoản; việc xóa tài khoản vật lý sẽ bị chặn và chưa có luồng ẩn danh hóa. Trước khi vận hành với dữ liệu thật, đơn vị quản lý phải phê duyệt thời hạn lưu, quyền truy cập, cách xử lý yêu cầu xóa/ẩn danh và phạm vi giữ audit. Không chạy lệnh xóa dữ liệu production chỉ để đạt mốc lưu trữ đề xuất.

Kiểm thử PostgreSQL `ReviewModerationIntegrationTest` bao phủ gửi báo cáo, trùng lặp, quyền của người đọc/thủ thư/quản trị, tài khoản bị khóa, ẩn/bác và tác động lên rating. Giao diện quản trị có test luồng ghi lý do và chặn truy cập từ tài khoản người đọc. Các test đó xác nhận logic hiện tại, không thay thế cho kiểm tra chính sách nội dung và quyền riêng tư trước khi triển khai thực tế.
