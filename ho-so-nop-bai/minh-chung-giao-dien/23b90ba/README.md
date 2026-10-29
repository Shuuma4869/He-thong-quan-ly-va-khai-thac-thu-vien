# Ảnh giao diện ở commit UI `23b90ba`

Bộ ảnh được chụp local ngày 29/10/2026 (giờ Việt Nam) bằng Chrome headless với Vite, Core, Insight và PostgreSQL demo đang chạy. `manifest.json` ghi SHA đầy đủ, thời điểm UTC, route, viewport, HTTP status và cảnh báo tràn ngang. Không dùng response mock. Đây là ảnh web, chưa phải ảnh thao tác trong EXE/WebView2.

Script đã mở 25 route Public, Reader, Staff, Admin ở bảy độ rộng 390, 768, 1024, 1366, 1440, 1536 và 1920 px: 175/175 lượt trả HTTP 200, không ghi nhận tràn ngang. Có 50 ảnh toàn trang ở 390 và 1440 px. Hai ảnh viewport `book-approved-viewport-1440.png` và `book-fallback-viewport-390.png` dùng trong báo cáo để đối chiếu bìa đã duyệt và bìa chữ khi thiếu ảnh.

[Bộ ảnh EXE E2E](desktop-e2e/README.md) được chụp riêng trong WebView2 với database test cô lập, có trạng thái báo cáo lưu thông, kiểm kê và đề xuất thực sự có dữ liệu. Không gộp bộ ảnh này với manifest web local ở trên.

Tài khoản trong ảnh là fixture demo. Ảnh không chứng minh mọi thao tác CRUD, độ chính xác của dữ liệu production, trợ năng WCAG hoặc runtime EXE. Kết quả CI của merge commit `8169ac7` và test frontend local ở `23b90ba` được ghi riêng trong báo cáo; không gán kết quả CI cũ cho SHA này.
