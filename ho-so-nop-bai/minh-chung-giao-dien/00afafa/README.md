# Minh chứng Reader – Librarian tại `00afafa`

Nguồn giao diện: code SHA `00afafa1fe8f84e87c1c93e0ddf1412f9bbba2d5` trên nhánh `Tuan/core-platform`. Ảnh được chụp bằng Playwright từ bài `Phase 4 Reader` với Core, Insight, PostgreSQL và Kafka tạm; không dùng response mock. Lượt kiểm tra cuối của kịch bản này đạt 1/1 bài, bao gồm Reader tạo yêu cầu, Librarian bàn giao và nhận trả, Core phân bổ Copy cho Hold tiếp theo, Insight ghi thông báo HOLD_READY và Reader mở hộp thông báo.

| Tệp | Màn hình |
|---|---|
| `book-detail-glass.png` | Chi tiết Book, tồn kho và chọn ấn bản |
| `reader-circulation-1440.png` | Reader xem lượt mượn/giữ chỗ ở viewport rộng |
| `reader-circulation-390.png` | Reader xem lượt mượn/giữ chỗ ở viewport hẹp |
| `staff-holds-ready-1440.png` | Librarian xem Hold READY, lịch sử và xác nhận bàn giao ở viewport rộng |
| `staff-holds-ready-390.png` | Cùng màn hình Librarian ở viewport hẹp |

PNG được giữ nguyên từ `frontend/test-results/`. Đây là ảnh ứng dụng Web với dữ liệu fixture ngẫu nhiên, không phải ảnh EXE/WebView2, dữ liệu vận hành, hay toàn bộ bằng chứng của bộ 25 bài E2E. CI của PR chưa chạy tại thời điểm ghi vì PR chưa được tạo.
