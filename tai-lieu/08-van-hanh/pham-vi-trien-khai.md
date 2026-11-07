# Phạm vi triển khai và nghiệm thu

Bản local gồm giao diện Web/Windows và các dịch vụ Core, Insight, PostgreSQL. Bộ cài Windows chỉ đóng gói giao diện; không phải hệ thống offline trọn gói. SMTP mặc định tắt; thông báo sự kiện cần Core outbox và Insight consumer cùng Kafka. Không bắt buộc seed demo để đăng ký hoặc mở Catalog rỗng.

## Phạm vi và bằng chứng đã công bố

Các mốc dưới đây được chuyển từ README để giữ lịch sử kiểm chứng, không thay kết quả trên commit hiện tại.

- Phase 5: truy vấn snapshot của Toàn đã vào main qua PR #25; phần phiên, scan, xử lý bất thường và UI có test PostgreSQL cùng E2E Web/EXE. Đã đo một phiên 5.000 Copy với 100 scan; chưa thử máy quét vật lý hoặc tải nhiều phiên trên mạng thật.
- Phase 6: Core có FTS/trigram, xếp hạng, bí danh Category và gợi ý; giao diện đã nối Search/API. Đã đo trên 10.013 Book demo, nhưng sáu câu relevance chỉ là mẫu nhỏ và chưa có SLA production.
- Phase 7: Core có read projection theo Book/chi nhánh, Insight có luồng phân tích/tạo/duyệt và CSV của các đề xuất đã lưu; E2E Core → Insight → UI trên Web/EXE đã đạt tại source `1580bf6`. Chưa có lịch sử đầy đủ lượt thêm Favorite, số lần tìm không ra sách, ngân sách hay luồng đặt mua; `APPROVED` chỉ là quyết định nội bộ.
- [Cấu hình pilot HTTPS](cloud-pilot.md) đã được chuẩn bị, chưa có máy chủ công cộng. Chưa nghiệm thu production, bộ cài trên máy Windows thứ hai hoặc chính sách lưu/xóa dữ liệu đề xuất.

## Điều kiện nghiệm thu một phiên bản mới

Cần CI trên đúng SHA, bootstrap checkout sạch, Web E2E, bộ cài và Installed EXE E2E, xác minh launcher cùng quyền dữ liệu. Kết quả trên máy phát triển không thay thử nghiệm máy thứ hai. Không có updater hoặc ký số; camera thật, thiết bị quét và SMTP Internet phải có bằng chứng riêng. Xem [pre-push gate](pre-push-gate.md), [desktop](desktop-windows.md) và [kiểm thử](../07-kiem-thu/test-strategy.md).
