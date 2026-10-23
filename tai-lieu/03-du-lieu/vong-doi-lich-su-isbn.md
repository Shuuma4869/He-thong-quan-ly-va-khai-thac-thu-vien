# Lưu giữ và xóa lịch sử tra cứu ISBN

## Dữ liệu và trách nhiệm

Insight lưu `metadata_lookups`: UUID người tra cứu, ISBN, nguồn/trạng thái và thời điểm tạo. UUID vẫn có thể liên kết với một người, không phải dữ liệu đã ẩn danh. Không lưu tiêu đề, ảnh, nội dung provider, email hoặc token trong bảng này.

Tuan chịu trách nhiệm chốt chính sách với đơn vị vận hành trước khi nhận dữ liệu thật. Core quản lý tài khoản; Insight quản lý lịch sử. Không có khóa ngoại hay transaction xuyên hai database.

## Hành vi hiện tại

| Tình huống | Hệ thống đang làm | Giới hạn |
|---|---|---|
| Nhân viên xóa một bản ghi của mình | DELETE kiểm owner tại server và xóa hàng trong Insight | Không xóa bản sao lưu, log hạ tầng hoặc dữ liệu phía provider |
| Không dùng chức năng nữa | Lịch sử vẫn còn cho đến khi người dùng xóa | Chưa có TTL, scheduler hoặc quota số hàng theo tài khoản |
| Tài khoản bị khóa/mất role nhân viên | Mỗi request hỏi lại Core và bị từ chối | Không tự xóa lịch sử; người mất role không còn dùng API history để tự xóa |
| Tài khoản không còn tồn tại trong Core | Core từ chối phiên; Insight không cho đọc/xóa/tra lại bằng phiên đó | Các hàng mang UUID cũ vẫn còn; không có cascade, consumer sự kiện xóa hoặc đối soát tài khoản mồ côi |

Core hiện chưa có API xóa tài khoản. ADMIN cũng chỉ đọc/xóa lịch sử của chính mình; không mở thêm quyền quản trị chéo để xử lý retention. Một request đã vượt kiểm quyền trước khi tài khoản bị khóa/xóa vẫn có thể ghi xong sau đó.

## Mốc đề xuất trước pilot

Các mốc dưới đây là lựa chọn vận hành cần được Tuan và đơn vị triển khai chốt, không phải thời hạn pháp luật đã được xác nhận và chưa được code tự động thi hành:

- Giữ lịch sử tối đa **90 ngày từ `created_at`**, không gia hạn khi replay hoặc đăng nhập lại. Cùng mốc cho tài khoản còn dùng và ngừng dùng; không cần thu thập thêm ngày đăng nhập cuối chỉ để xóa history.
- Sau khi xác minh yêu cầu xóa dữ liệu hoặc quyết định xóa tài khoản, hoàn tất xử lý history trong database hoạt động trong **30 ngày**. Khóa tài khoản để điều tra không tự đồng nghĩa với yêu cầu xóa.
- Bản sao lưu chứa history có vòng đời tối đa **30 ngày**, quyền truy cập hạn chế và mã hóa theo môi trường triển khai. Chưa có cơ chế xóa chọn lọc một người trong mọi backup; phải thông báo rõ độ trễ này.
- Không dùng lịch sử biên mục cho phân tích hành vi cá nhân hoặc tạo read model mới nếu chưa chốt mục đích, quyền truy cập và thời hạn lưu riêng.

Trước pilot có dữ liệu thật, cần có người chịu trách nhiệm, lịch xử lý và kiểm chứng xóa. Không mô tả bản Phase 2.5 là đã tự đáp ứng các mốc trên. Bản demo/CI chỉ dùng fixture; chưa cho phép suy từ fixture sang nghiệm thu vận hành dữ liệu cá nhân.

## Quy trình xử lý được phê duyệt

1. Xác minh yêu cầu, môi trường và UUID từ nguồn Core có thẩm quyền. Không dùng tên/email gần giống, không coi Core timeout/503 là bằng chứng tài khoản đã bị xóa.
2. Chốt phạm vi bằng truy vấn chỉ đọc: số hàng của đúng owner hoặc trước đúng mốc thời gian. Ghi người phê duyệt, người thực hiện và kế hoạch khôi phục; không đưa UUID hoặc dữ liệu thật vào repository/PR công khai.
3. Với tài khoản bị xóa, chặn request mới theo quy trình Identity và chờ các request đang chạy kết thúc; đối soát lại sau khoảng timeout. Khi chưa có luồng phối hợp xuyên service, không hứa xóa một lần là không thể xuất hiện thêm hàng mồ côi.
4. Chỉ người vận hành được ủy quyền mới thực hiện xóa có điều kiện trong transaction Insight, kiểm số hàng trước/sau và đối chiếu đúng phạm vi. Không dùng API owner-only với danh tính giả; không xóa Catalog hoặc dữ liệu giao dịch Core.
5. Giữ biên bản xử lý tối thiểu trong nơi lưu nội bộ có kiểm soát. Nếu phải phục hồi backup, cách ly môi trường phục hồi và áp dụng lại danh sách yêu cầu xóa trước khi mở truy cập. Danh sách này cũng cần thời hạn lưu và phân quyền riêng.

Tài liệu này không chạy lệnh xóa, không cài scheduler và không thay đổi dữ liệu production. Việc tự động hóa TTL, sự kiện xóa tài khoản, đối soát hàng mồ côi, xử lý yêu cầu xuất/xóa và backup nằm trong điều kiện vận hành trước pilot. Cần kiểm thử idempotency, mất kết nối, request đang chạy và restore trước khi đưa cơ chế đó vào sử dụng.
