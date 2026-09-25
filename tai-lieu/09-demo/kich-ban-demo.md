# Kịch bản demo tương lai

Tài liệu này mô tả câu chuyện mục tiêu, **không khẳng định feature đã tồn tại**.

1. Reader tìm “Clean Code”, xem các edition và availability theo branch.
2. Khi không còn copy, reader tạo hold và thấy vị trí/ETA có giải thích.
3. Librarian nhận một copy trả, hệ thống phân bổ hold kế tiếp trong transaction và chuẩn bị thông báo.
4. Librarian mở phiên kiểm kê một shelf, scan barcode và review misshelved/status mismatch.
5. Admin xem demand signal tổng hợp từ hold, circulation và zero-result search, rồi duyệt/từ chối đề xuất mua thêm.
6. Audit cho thấy actor, policy version, request/correlation ID và event liên quan.

Demo chỉ được dùng khi từng bước có test và dữ liệu chuẩn bị minh bạch. Không seed dữ liệu để giả vờ workflow đã hoàn thành.
