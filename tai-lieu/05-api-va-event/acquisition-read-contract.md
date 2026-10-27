# Dữ liệu đầu vào cho điểm nhu cầu

Core cung cấp `GET /api/v1/reports/acquisition-facts` cho nhân viên ACTIVE, nhận Book, chi nhánh và cửa sổ UTC tối đa 366 ngày. Insight gọi Core qua `CoreAcquisitionFactsAdapter`, chuyển bearer token của nhân viên, kiểm lại hợp đồng bằng `demandFactsFromSource`, rồi mới tính điểm. Insight không đọc database Core trực tiếp. `GET /acquisition/analysis` chỉ xem trước; `POST /acquisition/recommendations` chỉ nhận phạm vi và tự tải snapshot mới từ Core. Một Book/chi nhánh/cửa sổ chỉ có một DRAFT. Tạo, duyệt và từ chối đều lưu trong database Insight; duyệt không tạo đơn mua sách.

Mỗi lần lấy dữ liệu phải gắn `bookId`, `branchId`, cửa sổ UTC `[from,to)`, `asOf` và phiên bản nguồn. Các số đếm trong một response phải được chốt ở cùng một snapshot PostgreSQL. `asOf` là thời điểm chốt trạng thái hiện tại; không được diễn giải `copiesOwned`, `copiesAvailable` hoặc `waitingHolds` là trạng thái lịch sử tại `from` hay `to`. Cửa sổ và `asOf` phải đáp ứng giới hạn trong [công thức điểm](../04-nghiep-vu/thuat-toan/acquisition-score.md).

| Tín hiệu | Nguồn Core hiện có | Ý nghĩa chấp nhận | Khi thiếu |
|---|---|---|---|
| `copiesOwned`, `copiesAvailable` | `book_copies` → `editions` → `books`, vị trí `shelves.branch_id` | Số bản của Book tại chi nhánh, trạng thái hiện tại ở `asOf`; bắt buộc có snapshot | Từ chối tính điểm |
| `waitingHolds` | `holds.book_id`, `branch_id`, `status` | Số Hold `WAITING` hiện tại ở `asOf` | `null` và lý do |
| `loansStarted` | `loans.borrowed_at`, `edition_id`, `branch_id` | Số Loan bắt đầu trong `[from,to)`; nối Edition để xác định Book | `null` và lý do |
| `favoritesAdded` | Bảng `favorites` hiện chỉ lưu hàng còn tồn tại và `created_at` | Chưa thể đếm đầy đủ lượt thêm nếu người dùng đã bỏ yêu thích trong kỳ | Giữ `null` cho đến khi có nguồn sự kiện thêm/bỏ đáng tin cậy |
| Zero-result search, lượt xem khi hết sách | Chưa có bộ thu thập tương ứng | Không dùng trong `acquisition-v1` | Luôn ghi là unavailable, không tự điền 0 |

Mỗi tín hiệu có số đếm phải kèm nguồn và loại bằng chứng: `CURRENT_STATE` cho Hold, `WINDOWED_ROWS` cho Loan, `EVENT_ADDS` cho lượt thêm Favorite thực sự. Tín hiệu unavailable có `count: null` và lý do; Insight từ chối số Favorite hiện tại được gắn nhãn như toàn bộ lượt thêm. `sourceRevision` xác định phiên bản read projection, không thay thế bằng timestamp máy khách. Phạm vi Book/chi nhánh/cửa sổ trong response phải khớp request, không nhận số đếm từ frontend.

Read projection dùng transaction PostgreSQL `REPEATABLE READ` cho toàn bộ số đếm trong một request. Nó chỉ phục vụ một Book và một chi nhánh mỗi lần nên không phân trang. `asOf` là thời điểm Core bắt đầu đọc, không phải thời điểm kết thúc cửa sổ lịch sử. Token không được ghi vào recommendation, log hoặc dữ liệu nguồn. CSV ở `GET /acquisition/recommendations.csv` xuất các đề xuất đã lưu, tối đa 1000 dòng trong một snapshot Insight; có bộ lọc trạng thái, UTF-8 BOM và vô hiệu hóa công thức trong lời duyệt. CSV này không phải lịch sử đầy đủ về Favorite hay báo cáo đặt mua thực tế. Việc duyệt recommendation chỉ chấp thuận đề xuất nội bộ, không đặt mua hoặc đổi trạng thái Copy.

Toàn tạm dừng sau khi bàn giao truy vấn kiểm kê ở PR #25. Phần read projection Acquisition và CSV được triển khai trên nhánh Tuan theo phương án dự phòng được chủ dự án đồng ý, rồi vào `main` qua PR #27. Commit gốc của Toàn được giữ nguyên khi tích hợp truy vấn kiểm kê; không gán phần mã mới này cho Toàn.
