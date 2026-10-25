# Dữ liệu đầu vào cho điểm nhu cầu

Đây là hợp đồng đầu vào phía Insight để nối với read projection Phase 7 của Toàn. Chưa có endpoint Core tương ứng; tên route và DTO bên ngoài cần được review cùng PR của Toàn. Insight không đọc database Core trực tiếp. `AcquisitionFactsPort` và `demandFactsFromSource` chỉ kiểm dữ liệu nhận được, chưa tự tải hoặc tạo số đếm. `RecommendationWorkflow` lưu điểm, bằng chứng và quyết định vào database Insight khi được gọi từ mã tin cậy; hiện chưa có route HTTP tạo đề xuất hay nguồn Core để gọi nó trong runtime.

Mỗi lần lấy dữ liệu phải gắn `bookId`, `branchId`, cửa sổ UTC `[from,to)`, `asOf` và phiên bản nguồn. Các số đếm trong một response phải được chốt ở cùng một snapshot PostgreSQL. `asOf` là thời điểm chốt trạng thái hiện tại; không được diễn giải `copiesOwned`, `copiesAvailable` hoặc `waitingHolds` là trạng thái lịch sử tại `from` hay `to`. Cửa sổ và `asOf` phải đáp ứng giới hạn trong [công thức điểm](../04-nghiep-vu/thuat-toan/acquisition-score.md).

| Tín hiệu | Nguồn Core hiện có | Ý nghĩa chấp nhận | Khi thiếu |
|---|---|---|---|
| `copiesOwned`, `copiesAvailable` | `book_copies` → `editions` → `books`, vị trí `shelves.branch_id` | Số bản của Book tại chi nhánh, trạng thái hiện tại ở `asOf`; bắt buộc có snapshot | Từ chối tính điểm |
| `waitingHolds` | `holds.book_id`, `branch_id`, `status` | Số Hold `WAITING` hiện tại ở `asOf` | `null` và lý do |
| `loansStarted` | `loans.borrowed_at`, `edition_id`, `branch_id` | Số Loan bắt đầu trong `[from,to)`; nối Edition để xác định Book | `null` và lý do |
| `favoritesAdded` | Bảng `favorites` hiện chỉ lưu hàng còn tồn tại và `created_at` | Chưa thể đếm đầy đủ lượt thêm nếu người dùng đã bỏ yêu thích trong kỳ | Giữ `null` cho đến khi có nguồn sự kiện thêm/bỏ đáng tin cậy |
| Zero-result search, lượt xem khi hết sách | Chưa có bộ thu thập tương ứng | Không dùng trong `acquisition-v1` | Luôn ghi là unavailable, không tự điền 0 |

Mỗi tín hiệu có số đếm phải kèm nguồn và loại bằng chứng: `CURRENT_STATE` cho Hold, `WINDOWED_ROWS` cho Loan, `EVENT_ADDS` cho lượt thêm Favorite thực sự. Tín hiệu unavailable có `count: null` và lý do; Insight từ chối số Favorite hiện tại được gắn nhãn như toàn bộ lượt thêm. `sourceRevision` xác định phiên bản read projection, không thay thế bằng timestamp máy khách. Phạm vi Book/chi nhánh/cửa sổ trong response phải khớp request, không nhận số đếm từ frontend.

Read projection của Toàn cần kiểm quyền Librarian/Admin hiện hành, giới hạn khoảng thời gian, thứ tự ổn định khi phân trang và test PostgreSQL cho count, filter, snapshot. Port phía Insight dành chỗ chuyển Authorization của nhân viên sang Core; token không được ghi vào recommendation, log hoặc dữ liệu nguồn. Trước khi nối API, hai bên cần chốt route, DTO lỗi, cách lấy `asOf`, phiên bản và quyền gọi từ Insight. Việc duyệt recommendation chỉ chấp thuận đề xuất nội bộ, không đặt mua hoặc đổi trạng thái Copy.
