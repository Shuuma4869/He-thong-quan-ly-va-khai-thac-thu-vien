# Ảnh giao diện của PR #31

Mười ba ảnh PNG trong thư mục này được lấy nguyên bản từ artifact `web-e2e-results` của [CI run 40690841710](https://github.com/Shuuma4869/He-thong-quan-ly-va-khai-thac-thu-vien/actions/runs/40690841710), tại commit `0ef4007ac95fc4704e56527569fb0c1399a56e0d` trên `Tuan/core-platform`. Job `web-e2e` chạy ứng dụng web và API với dữ liệu kiểm thử; đây không phải ảnh chụp ứng dụng Windows/WebView2. Các PNG được lấy từ `test-results/` trong artifact, không chỉnh sửa nội dung.

Hai ảnh `appearance-1440.png` và `login-1440.png` được chụp thêm từ cùng checkout bằng Chromium riêng của Playwright tại 1440 × 900, Vite localhost, ngày 28/10/2026. Backend local chưa chạy lúc chụp; hai trang này không cần dữ liệu nghiệp vụ. Đây là bằng chứng bố cục và nội dung tĩnh, không chứng minh đồng bộ settings với Core. Ảnh đầu chụp với Chrome có tiện ích ngoài LAMS tạo chấm xanh, đã bị thay bằng ảnh Chromium sạch; không sửa ảnh để che chi tiết giao diện.

| Nhóm | Tệp | Điều có thể quan sát |
|---|---|---|
| Public | `landing-1440.png`, `catalog-1440.png`, `catalog-390.png` | Trang giới thiệu và danh mục ở desktop/mobile |
| Reader | `reviews-1440.png`, `reader-circulation-1440.png`, `hold-eta-1440.png` | Đánh giá, mượn/giữ chỗ và ước tính nhận sách |
| Staff | `staff-circulation-1440.png`, `inventory-1440.png`, `circulation-report-1440.png`, `acquisition-empty-390.png`, `history-1440.png`, `catalog-staff-copy.png` | Quầy lưu thông, kiểm kê, báo cáo, đề xuất, lịch sử ISBN và biên mục |
| Admin | `members-admin.png` | Danh sách thành viên trong phiên admin của bài E2E |
| Khách | `appearance-1440.png`, `login-1440.png` | Trang tùy chỉnh giao diện và đăng nhập, chụp local không backend |

Ảnh là bằng chứng màn hình ở một trạng thái do bài kiểm thử dựng. Không dùng ảnh để kết luận mọi nhánh nghiệp vụ đã được thử, hoặc gán kết quả này cho commit khác. Trang cài đặt giao diện và màn admin quản lý tài khoản cần ảnh riêng nếu đưa vào báo cáo phiên bản nộp cuối. Bản báo cáo có thể cắt khung nhìn từ các ảnh này để in dễ đọc; bản gốc ở đây vẫn giữ nguyên.
