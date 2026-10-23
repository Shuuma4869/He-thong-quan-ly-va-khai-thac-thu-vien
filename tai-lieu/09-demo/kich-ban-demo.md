# Kịch bản demo LAMS

## Phần có thể demo ở Phase 1

Mở cửa sổ LAMS theo [runbook desktop](../08-van-hanh/desktop-windows.md), với Core và hạ tầng đang chạy. Reader đăng ký/đăng nhập, đọc Hồ sơ của tôi, reload để kiểm khôi phục phiên, rồi đăng xuất. Profile bổ sung hiện chưa có nên hiển thị trạng thái trống, không có form lưu.

Với tài khoản Librarian/Admin đã được cấp quyền hợp lệ, mở Thành viên, tìm theo mã/họ tên, lọc trạng thái, sắp xếp, phân trang và reload/Back. Reader không được mở danh sách staff. Ứng dụng không có API công khai tự nâng quyền; fixture E2E staff chỉ thuộc database kiểm thử tạm, không dùng để cấp quyền trên dữ liệu thật.

Catalog đã có API và UI Phase 2. Chuẩn bị dữ liệu minh họa có nguồn rõ trên môi trường demo riêng; không suy database có sẵn dữ liệu. Không dùng tài khoản hoặc dữ liệu cá nhân thật trong slide/video nếu chưa được phép.

## Kịch bản học phần dự kiến 7 phút 20 giây

| Thời gian | Thao tác | Bằng chứng |
|---|---|---|
| 0:00–0:35 | Giới thiệu phạm vi, Book/Edition/Copy | Sơ đồ và SHA demo |
| 0:35–1:20 | Login, Profile, Reader bị chặn staff | UI và response thật |
| 1:20–2:15 | Tìm/filter sách, xem Edition và Author | API server, không fake availability |
| 2:15–3:00 | Staff tra Member, pagination | Không lộ dữ liệu ngoài DTO |
| 3:00–4:00 | Biên mục, Copy/version, duyệt ảnh thủ công | Dữ liệu chuẩn bị minh bạch |
| 4:00–5:30 | Tra ISBN và lưu history, reload, lọc/mở lại | Insight PostgreSQL; nguồn unavailable hiển thị đúng |
| 5:30–6:10 | User khác không đọc/xóa; chủ xóa history | 404 và persistence thật |
| 6:10–6:50 | Test/CI đúng SHA, phân biệt unit/integration/E2E | Không lấy screenshot thay kết quả test |
| 6:50–7:20 | Phân công, giới hạn, roadmap | Phân biệt implementation, bằng chứng SHA và các nghiệp vụ chưa có |

Đây là phân bổ thời gian dự kiến, chưa phải video đã quay hoặc đo thời lượng. Chỉ quay sau khi gate kỹ thuật đạt; không có link video cho đến khi xuất bản thật.

## Câu chuyện mục tiêu cho các phase sau

Tài liệu này mô tả câu chuyện mục tiêu, **không khẳng định feature đã tồn tại**.

1. Reader tìm “Clean Code”, xem các edition và availability theo branch.
2. Khi không còn copy, reader tạo hold và thấy vị trí/ETA có giải thích.
3. Librarian nhận một copy trả, hệ thống phân bổ hold kế tiếp trong transaction và chuẩn bị thông báo.
4. Librarian mở phiên kiểm kê một shelf, scan barcode và review misshelved/status mismatch.
5. Admin xem demand signal tổng hợp từ hold, circulation và zero-result search, rồi duyệt/từ chối đề xuất mua thêm.
6. Audit cho thấy actor, policy version, request/correlation ID và event liên quan.

Demo chỉ được dùng khi từng bước có test và dữ liệu chuẩn bị minh bạch. Không seed dữ liệu để giả vờ workflow đã hoàn thành.
