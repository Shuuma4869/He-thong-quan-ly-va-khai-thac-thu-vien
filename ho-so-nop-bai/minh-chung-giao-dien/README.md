# Minh chứng giao diện history ISBN

Hai ảnh được chụp bằng Playwright trong [CI run 39871120289](https://github.com/Shuuma4869/He-thong-quan-ly-va-khai-thac-thu-vien/actions/runs/39871120289), head commit `0075377995ea9bcd313d15cd0e147b58279d1718`, artifact `web-e2e-results`. Không chỉnh sửa nội dung ảnh. Ngày kiểm tra 23/10/2026 theo giờ Việt Nam; timestamp trên ảnh dùng timezone trình duyệt CI (UTC).

Luồng thật: Core tạo tài khoản fixture → cấp role trong database test → đăng nhập UI → lưu history qua Nest/Prisma/PostgreSQL → reload → replay → kiểm bàn phím → chụp ảnh. Sau đó test chặn cross-owner 404 và xóa. Không intercept response để tạo dữ liệu history. Dữ liệu là fixture, không phải thông tin thành viên thật.

- [History 1440 px](history-1440.png): bố cục desktop web, không phải cửa sổ EXE.
- [History 390 px](history-390.png): bố cục hẹp, control xuống dòng và focus trên bộ lọc.

Provider Open Library trả `ok` trong lượt ảnh này; không suy provider luôn khả dụng từ một lần chạy. Google Books tắt. Screenshot không thay test persistence/owner và không chứng minh Tauri WebView2 đã nghiệm thu. Phần nội dung metadata đang hiển thị được tra trực tiếp, không lưu snapshot vào history.

## EXE/WebView2 trên Windows

Ngày 23/10/2026 lúc 12:53 (Asia/Saigon), chạy `scripts/test-phase1-e2e.ps1 -Desktop` tại head `ee929cdd5f05ed465aec784ba27f06660e5b19a7`: **8 passed (24.6s), DESKTOP_E2E_PASS**. Docker Engine Linux 29.3.1, Node 22.23.3, Java 21.0.12. Core/Insight/PostgreSQL thật dùng container tạm riêng; script dọn container và các tiến trình đã khởi tạo sau test.

EXE local được build tại `0075377`; diff tới `ee929cd` chỉ có tài liệu/ảnh, không đổi mã runtime hoặc test. SHA-256 `lams-desktop.exe`: `E149687E81149F2E64441FBCD3FA47F00F6AFFB37A7B5A5A327F43CA2F8E7115`. Script xác nhận process/window handle của EXE và test kiểm `__TAURI_INTERNALS__` trong trang WebView2; không chỉ mở tab Chrome rồi gọi là desktop.

- [History EXE 1440 px](history-desktop-1440.png).
- [History EXE 390 px](history-desktop-390.png).

Đây là ảnh nội dung WebView2 chụp qua Playwright/CDP, không gồm khung cửa sổ Windows; kích thước 390 là viewport kiểm responsive, không phải ứng dụng mobile. Ảnh nguyên bản, không chỉnh sửa. Fixture và luồng kiểm giống web; không dùng dữ liệu người dùng thật. Lượt này kiểm EXE build local, không phải bài kiểm thao tác cài/gỡ installer hoặc triển khai HTTPS.
