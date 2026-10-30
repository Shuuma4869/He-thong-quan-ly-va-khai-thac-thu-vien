# Kịch bản demo LAMS

## Chuẩn bị

Chạy Docker PostgreSQL/Redis/Kafka, Core cổng 8080, Insight cổng 3000 và Web cổng 5173 theo hướng dẫn chạy local. EXE nằm trong frontend/src-tauri/target/release; backend vẫn phải chạy. Đăng nhập tài khoản Librarian đã cấp theo tài liệu dữ liệu demo, không đưa mật khẩu lên slide hoặc video.

Bộ demo có 10.013 Book nhưng chỉ 64 Copy vật lý. Các bản Gutenberg tham khảo không mặc nhiên có thể mượn. Chọn đúng Book, chi nhánh, kệ và barcode của bộ 32 sách nghiệp vụ khi trình diễn Inventory/Acquisition. E2E tự tạo dữ liệu trên PostgreSQL tạm; nó không thêm Loan/Hold hay đề xuất vào database demo.

## Hành trình Reader – Librarian (Phase 4)

1. Reader mở chi tiết một Book có Copy thật, so sánh tồn kho theo ấn bản và chi nhánh, rồi chọn nơi nhận. Nếu có sách, gửi yêu cầu nhận tại quầy; trạng thái READY chưa phải Loan.
2. Librarian mở **Quản lý giữ chỗ**, tìm Reader và Book, kiểm tra bản được phân bổ rồi xác nhận đã giao sách vật lý. Chỉ sau xác nhận này Core mới tạo Loan; Reader thấy hạn trả trong **Lượt mượn và giữ chỗ**.
3. Reader đăng ký thêm một yêu cầu khi Copy đang được mượn. Yêu cầu phải hiển thị WAITING, không tạo Loan. Khi Librarian nhận trả Copy tại quầy, Core phân bổ Copy đó cho người chờ kế tiếp trong transaction nhận trả.
4. Reader kiểm tra trạng thái READY và mở **Thông báo**. Khi Kafka/Insight được bật, thông báo HOLD_READY phải khớp yêu cầu vừa được phân bổ. Thông báo là xác nhận sự kiện đã được Insight ghi nhận, không thay thế việc Core kiểm tra hạn nhận ở quầy.

Không trình diễn bằng cách gọi API tạo Loan trực tiếp hoặc đánh dấu Copy AVAILABLE để bỏ qua bàn giao. Nếu không có Kafka, vẫn có thể xác minh phân bổ trong Core nhưng không được khẳng định thông báo Insight đã được giao.

## Luồng trình diễn Phase 5–7

1. Kiểm kê: Nhân viên mở phiên theo chi nhánh/kệ, quét barcode bằng bàn phím hoặc máy quét kiểu bàn phím, rồi chốt. Có thể quét ở kệ khác trên database demo để tạo bằng chứng sai kệ; xem snapshot, scan và anomaly trước khi xác nhận chuyển kệ. Việc xác nhận thay đổi vị trí Copy demo, nên ghi lại vị trí ban đầu nếu cần trình diễn lại. Không có camera/offline; chưa kiểm máy quét vật lý trên máy thứ hai.
2. Tìm sách: Tìm tên có dấu và không dấu, thử tên gần đúng, tác giả và ISBN có trong Catalog. Chọn bí danh “Khoa học giả tưởng” để lọc về Category chuẩn “Khoa học viễn tưởng”; mở trang tiếp theo rồi reload để thấy URL giữ bộ lọc. Gợi ý trên topbar gọi API Core, không tải toàn bộ 10.013 Book vào trình duyệt.
3. Chuẩn bị số liệu Acquisition: Với cùng Book và chi nhánh có Copy vật lý, tạo một Loan và một Hold đang WAITING qua luồng nghiệp vụ. Chọn cửa sổ UTC bắt đầu trước Loan và kết thúc sau Loan nhưng không vượt hiện tại. Nếu chưa chuẩn bị, trang phân tích vẫn hợp lệ nhưng sẽ cho số liệu thấp hoặc rỗng; không mô tả nó là nhu cầu cao.
4. Phân tích và quyết định: Librarian mở “Đề xuất bổ sung sách”, chọn Book/chi nhánh/cửa sổ, xem số Copy, Hold, Loan, score, confidence và lý do thiếu Favorite. Lưu DRAFT, reload để kiểm persistence, nhập lý do rồi duyệt nội bộ. Tạo một đề xuất khác ở cửa sổ khác để thử từ chối. Mở bằng chứng/audit và tải CSV. APPROVED không tạo đơn mua, thanh toán hoặc Copy mới.
5. Kết thúc: Cho xem kết quả test và CI của đúng commit đang báo cáo. Nêu rõ Web/EXE là bản demo local; đổi email cần bật SMTP/Mailpit riêng, thời hạn lưu dữ liệu Acquisition chưa được đơn vị vận hành phê duyệt, zero-result search và lịch sử thêm Favorite chưa có nguồn hoàn chỉnh.

Hành trình Reader–Librarian và các bước Phase 2–7 được tự động hóa trong `frontend/e2e/phase1.spec.ts`. Để kiểm tra cả outbox → Kafka → Insight, chạy `.\scripts\test-phase1-e2e.ps1 -EnableKafkaNotifications`; script tạo broker và database tạm trên loopback, rồi dọn tài nguyên do chính lượt chạy tạo. Có thể thêm `-Grep "Phase 4 Reader"` để chạy riêng luồng nhận trả/phân bổ/thông báo. Chụp desktop/mobile được lưu trong `frontend/test-results/` và không thay cho bằng chứng chạy test. Chỉ gắn ảnh/video vào bộ minh chứng sau khi chạy lại trên commit SHA cuối cùng; không coi ảnh từ working tree chưa commit là ảnh final SHA.
