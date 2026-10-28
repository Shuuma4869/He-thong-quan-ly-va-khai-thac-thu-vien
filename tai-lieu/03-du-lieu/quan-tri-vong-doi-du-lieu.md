# Vòng đời dữ liệu khi vận hành LAMS

Tài liệu này phân biệt dữ liệu cần giữ để đối chiếu nghiệp vụ với dữ liệu có thể hết mục đích sử dụng. Bản demo không có bộ dọn dữ liệu tự động. Mốc lưu giữ production và quy trình xóa cần đơn vị vận hành phê duyệt trước khi tiếp nhận dữ liệu thật; các mốc đề xuất cho [lịch sử ISBN](vong-doi-lich-su-isbn.md) không áp dụng cho nhóm khác.

| Nhóm dữ liệu | Mục đích và nơi lưu | Quyền hiện có | Quyết định còn thiếu |
|---|---|---|---|
| Tài khoản, vai trò, refresh token | Core: đăng nhập và kiểm quyền; token lưu dạng hash | Người dùng/nhân viên theo API Identity | Thời hạn hồ sơ, token đã thu hồi, quy trình nghỉ việc và xóa tài khoản |
| Loan, Hold, receipt, audit lưu thông | Core: giao dịch mượn trả, chống lặp lệnh và tra soát | Reader xem của mình; staff xem theo quyền hiện hành | Thời hạn giao dịch/receipt, nghĩa vụ lưu chứng cứ, archive và xử lý FK |
| Phiên kiểm kê, scan, bất thường, evidence | Core: đối chiếu bản sách tại thời điểm kiểm kê | Librarian/Admin | Thời hạn scan/evidence, giới hạn xuất và cách lưu biên bản đã chốt |
| Lịch sử tra ISBN | Insight: dấu vết tra cứu gắn UUID nhân viên | Chỉ chủ sở hữu còn quyền | Mốc đề xuất và các bước còn thiếu ghi tại tài liệu ISBN riêng |
| Đề xuất Acquisition, evidence, decision | Insight: giải thích điểm và quyết định bổ sung | Librarian/Admin | Thời hạn đề xuất, quyết định, backup và quy trình ẩn danh ghi tại tài liệu Acquisition riêng |
| CSV đã tải | Máy người tải, ngoài database | Người giữ file và chính sách thiết bị của đơn vị | Nơi lưu, quyền chia sẻ, thời hạn và cách thu hồi bản đã xuất |
| Log và backup | Máy chạy dịch vụ hoặc kho lưu vận hành | Quản trị hệ thống được ủy quyền | Thời hạn, mã hóa, kiểm truy cập và nơi giữ bản sao ngoài máy |

## Khi người dùng hoặc nhân viên ngừng sử dụng

Khóa tài khoản hoặc thu hồi vai trò ở Core trước để chặn request mới. Kiểm tra các request đang chạy, phiên đăng nhập, Hold còn hiệu lực và bản ghi do người đó tạo; không coi khóa tài khoản là yêu cầu xóa mọi chứng cứ. Insight chỉ có UUID, không có khóa ngoại hay giao dịch với Core, nên tài khoản đã xóa ở Core không tự làm mất lịch sử ISBN hoặc chữ ký quyết định Acquisition. Người có thẩm quyền phải xác minh danh tính, nghĩa vụ giữ lại và phạm vi yêu cầu trước khi xử lý từng nhóm. Không dùng danh tính giả để gọi API owner-only.

Trước một thao tác archive/purge được phê duyệt: chụp backup có thể phục hồi, đếm bằng truy vấn chỉ đọc, ghi mốc UTC/phạm vi/người phê duyệt, thử trên bản sao cô lập, rồi mới chạy transaction có kiểm số hàng và đối soát sau. Hiện repository chỉ có preview đếm bản ghi cũ cho ISBN và Acquisition; **không có lệnh purge production**. Nếu restore backup cũ, phải áp dụng lại các yêu cầu xóa đã hoàn tất trước khi mở truy cập; bản CSV đã tải và bản sao ngoài hệ thống cần xử lý riêng.

## Điều kiện trước pilot có dữ liệu thật

Đơn vị vận hành cần chỉ định người chịu trách nhiệm dữ liệu, thông qua thời hạn riêng cho mỗi nhóm, cách xử lý FK/audit, hạn giữ log/backup/CSV, quy trình yêu cầu truy cập hoặc xóa và người xác nhận đối soát. Cần kiểm thử tình huống request đang chạy, lỗi giữa Core và Insight, restore từ backup cũ và thao tác lặp lại. Cho đến khi có quyết định và cơ chế được nghiệm thu, retention production là **chưa đạt**; không suy ra từ việc API cho phép người dùng xóa một hàng lịch sử của chính mình.
