# Kịch bản demo LAMS

## Phần có thể demo ở Phase 1

Mở cửa sổ LAMS theo [runbook desktop](../08-van-hanh/desktop-windows.md), với Core và hạ tầng đang chạy. Reader đăng ký/đăng nhập, đọc Hồ sơ của tôi, reload để kiểm khôi phục phiên, rồi đăng xuất. Profile bổ sung hiện chưa có nên hiển thị trạng thái trống, không có form lưu.

Với tài khoản Librarian/Admin đã được cấp quyền hợp lệ, mở Thành viên, tìm theo mã/họ tên, lọc trạng thái, sắp xếp, phân trang và reload/Back. Reader không được mở danh sách staff. Ứng dụng không có API công khai tự nâng quyền; fixture E2E staff chỉ thuộc database kiểm thử tạm, không dùng để cấp quyền trên dữ liệu thật.

Catalog vẫn hiển thị chưa có dữ liệu; không trình bày placeholder thành chức năng tìm sách đã hoàn thiện. Không dùng tài khoản hoặc dữ liệu cá nhân thật trong slide/video nếu chưa được phép.

## Câu chuyện mục tiêu cho các phase sau

Tài liệu này mô tả câu chuyện mục tiêu, **không khẳng định feature đã tồn tại**.

1. Reader tìm “Clean Code”, xem các edition và availability theo branch.
2. Khi không còn copy, reader tạo hold và thấy vị trí/ETA có giải thích.
3. Librarian nhận một copy trả, hệ thống phân bổ hold kế tiếp trong transaction và chuẩn bị thông báo.
4. Librarian mở phiên kiểm kê một shelf, scan barcode và review misshelved/status mismatch.
5. Admin xem demand signal tổng hợp từ hold, circulation và zero-result search, rồi duyệt/từ chối đề xuất mua thêm.
6. Audit cho thấy actor, policy version, request/correlation ID và event liên quan.

Demo chỉ được dùng khi từng bước có test và dữ liệu chuẩn bị minh bạch. Không seed dữ liệu để giả vờ workflow đã hoàn thành.
