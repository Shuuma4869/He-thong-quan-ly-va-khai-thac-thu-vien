# Minh chứng giao diện history ISBN

Hai ảnh được chụp bằng Playwright trong [CI run 39871120289](https://github.com/Shuuma4869/He-thong-quan-ly-va-khai-thac-thu-vien/actions/runs/39871120289), head commit `0075377995ea9bcd313d15cd0e147b58279d1718`, artifact `web-e2e-results`. Không chỉnh sửa nội dung ảnh. Ngày kiểm tra 23/10/2026 theo giờ Việt Nam; timestamp trên ảnh dùng timezone trình duyệt CI (UTC).

Luồng thật: Core tạo tài khoản fixture → cấp role trong database test → đăng nhập UI → lưu history qua Nest/Prisma/PostgreSQL → reload → replay → kiểm bàn phím → chụp ảnh. Sau đó test chặn cross-owner 404 và xóa. Không intercept response để tạo dữ liệu history. Dữ liệu là fixture, không phải thông tin thành viên thật.

- [History 1440 px](history-1440.png): bố cục desktop web, không phải cửa sổ EXE.
- [History 390 px](history-390.png): bố cục hẹp, control xuống dòng và focus trên bộ lọc.

Provider Open Library trả `ok` trong lượt ảnh này; không suy provider luôn khả dụng từ một lần chạy. Google Books tắt. Screenshot không thay test persistence/owner và không chứng minh Tauri WebView2 đã nghiệm thu. Phần nội dung metadata đang hiển thị được tra trực tiếp, không lưu snapshot vào history.
