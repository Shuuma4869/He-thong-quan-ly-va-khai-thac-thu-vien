# Tình trạng bản sách cho người đọc

Trang chi tiết tác phẩm gọi `GET /api/v1/public/catalog/books/{id}/availability` để xem số bản sẵn có theo **ấn bản và chi nhánh**. Đây là dữ liệu từ `book_copies`, không phải một cột số lượng lưu trên Book. Chỉ chi nhánh ACTIVE có bản sách mới xuất hiện; tác phẩm tham khảo chưa có Copy trả danh sách rỗng.

Core đọc trong transaction `REPEATABLE READ`. Một Copy chỉ được đếm sẵn có khi trạng thái là `AVAILABLE`, không có Loan chưa trả và không được gán cho Hold `READY`. API còn trả số Hold `WAITING` liên quan tới Book/ấn bản tại chi nhánh để người đọc có bối cảnh; yêu cầu “bất kỳ ấn bản” có thể được tính vào nhiều dòng và **không được cộng các dòng đó thành tổng số người chờ**. Phản hồi có `checkedAt` từ database. Không trả barcode, kệ, người mượn hay ID yêu cầu giữ chỗ.

Giao diện có trạng thái đang tải, lỗi/thử lại, chưa có Copy và nút tải lại. Số liệu chỉ đúng ở snapshot vừa đọc: Copy có thể được nhân viên cho mượn hoặc gán Hold ngay sau đó. API này không giữ chỗ và không hứa người đọc sẽ nhận được sách. Luồng tạo Hold vẫn kiểm tra tình trạng và thứ tự ưu tiên trong transaction riêng. Một Book có quá 200 cặp ấn bản/chi nhánh trả 422; cần phân trang endpoint trước khi dùng cho thư viện quy mô vượt mức đó.

`PublicCatalogIntegrationTest` kiểm trên PostgreSQL thật với Copy AVAILABLE/ON_LOAN/LOST, Loan đang mở, Hold READY/WAITING và chi nhánh DISABLED; test đổi trạng thái Copy rồi tải lại. `CatalogFlow.test.tsx` kiểm số liệu từ API, lỗi, trạng thái rỗng và refresh. Chưa có phép đo về độ trễ dưới tải đồng thời nhiều người đọc hoặc mô phỏng máy chủ nhiều instance; kết quả cần gắn SHA khi nghiệm thu.
