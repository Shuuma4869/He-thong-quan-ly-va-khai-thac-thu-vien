# Lưu giữ đề xuất bổ sung sách

## Dữ liệu đang lưu

Insight giữ đề xuất, điểm, phiên bản công thức, snapshot số liệu và lý do quyết định trong `acquisition_recommendations`; `acquisition_decisions` giữ từng quyết định. Các UUID `created_by`, `reviewed_by` và `actor_id` có thể liên kết tới nhân viên trong Core, nên vẫn là dữ liệu cá nhân dạng định danh gián tiếp. Evidence không chứa tên, email, token hoặc lịch sử mượn của từng bạn đọc. CSV được tạo khi nhân viên tải, không được lưu trong database Insight; file đã tải nằm dưới quyền quản lý của máy người tải và chính sách backup của đơn vị vận hành.

## Hành vi hiện tại

Chỉ LIBRARIAN/ADMIN còn quyền trong Core mới xem, tạo, duyệt và tải CSV. API không có lệnh sửa hoặc xóa đề xuất/bằng chứng/quyết định. Khi nhân viên bị khóa, mất quyền hoặc ngừng làm việc, request mới bị Core từ chối; bản ghi cũ vẫn giữ UUID của họ để đối chiếu quyết định. Nếu tài khoản Core bị xóa, Insight không tự biết và UUID cũ không tự biến thành dữ liệu ẩn danh. Database Core và Insight không có giao dịch hoặc khóa ngoại chung.

Không có TTL, archive hoặc purge tự động. Backup, bản CSV đã tải và log vận hành có vòng đời riêng; xóa một hàng trong database không xóa các bản sao đó. Vì vậy bản demo local có thể nghiệm thu luồng tạo/duyệt, nhưng chưa thể tuyên bố đã đáp ứng chính sách lưu giữ cho production.

## Rà soát trước pilot

Người phụ trách dữ liệu của đơn vị vận hành cần phê duyệt bằng văn bản thời hạn giữ đề xuất, bằng chứng, quyết định và backup; vai trò được phép xuất dữ liệu; nơi lưu CSV; và cách xử lý yêu cầu xóa/ẩn danh. Không tự chọn mốc ngày từ thời hạn của lịch sử ISBN vì mục đích và giá trị chứng cứ khác nhau.

Lệnh `cd backend/insight-service; node scripts/acquisition-retention-preview.mjs 2026-01-01T00:00:00Z` chỉ đếm bản ghi tạo trước mốc UTC được nhập. Mốc là tham số khảo sát, **không phải thời hạn chính sách**. Chạy bằng tài khoản database chỉ đọc nếu dùng ngoài môi trường demo. Output không có UUID cá nhân hoặc nội dung evidence. Không có lệnh purge trong repository.

Khi nhân viên rời hệ thống, trước hết khóa quyền ở Core; kiểm tra các request đang chạy, sau đó đối chiếu các quyết định liên quan bằng người được ủy quyền. Nếu có yêu cầu xóa hoặc ẩn danh, phải xác minh danh tính, nghĩa vụ giữ chứng cứ và phạm vi backup trước khi phê duyệt. Bất kỳ archive/purge nào sau này cần bản sao có thể khôi phục, dry-run số hàng, xác nhận hai người, transaction có kiểm số hàng và biên bản; không tách quyết định khỏi evidence hoặc ghi đè UUID trong một bước âm thầm. Phục hồi backup phải áp dụng lại các yêu cầu xóa đã được phê duyệt trước khi mở truy cập.

Lượt Favorite thêm mới và tìm kiếm không có kết quả hiện chưa được giữ làm lịch sử Acquisition; bảng `favorites` chỉ phản ánh mục còn lưu. Không dùng số hiện tại để dựng lại quá khứ. Nếu bổ sung nguồn sự kiện, phải chốt riêng mục đích, thời hạn và xử lý người dùng ngừng sử dụng trước khi bật thu thập.
