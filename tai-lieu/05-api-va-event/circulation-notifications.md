# Tiếp nhận sự kiện lưu thông trong Insight

`LoanEventsConsumer` đọc hai topic Loan/Hold của Core, kiểm envelope rồi ghi trạng thái thông báo vào PostgreSQL của Insight. Các event được nhận gồm `COPY_BORROWED`, `COPY_RETURNED`, `LOAN_RENEWED`, `HOLD_CREATED`, `HOLD_READY`, `HOLD_EXPIRED`, `HOLD_CANCELLED` và `HOLD_FULFILLED`. Nó không truy cập database Core và không quyết định sách đã sẵn sàng hay người dùng còn quyền nhận sách. Mọi hành động mượn, trả và nhận giữ chỗ vẫn phải được Core xác minh tại thời điểm gửi lệnh.

Insight có API và giao diện hộp thông báo để Reader xem, đếm mục chưa đọc và đánh dấu đã đọc. Các sự kiện tạo thông báo gồm tạo Hold, Hold sẵn sàng/hết hạn, mượn, trả và gia hạn. Nhắc hạn trả được tạo từ dữ liệu Loan đã nhận trong Insight, không phải Kafka event. Mục chỉ được tạo khi consumer hoạt động; chưa có gửi email hoặc push. Không diễn giải việc ghi bảng thành người dùng đã thực sự mở ứng dụng và đọc thông báo.

Work Inbox dành cho Librarian/Admin lấy công việc từ cùng chuỗi Outbox → Kafka → Insight: `HOLD_CREATED` mở mục `WAITING`; `HOLD_READY` đóng mục chờ và mở mục `READY`; hết hạn, hủy hoặc bàn giao đóng các mục đang mở của Hold. API `GET /api/v1/staff/work-items` hỗ trợ lọc theo chi nhánh/trạng thái và phân trang; `GET /api/v1/staff/work-items/unread-count` đếm mục chưa xử lý. Nút mở nghiệp vụ dẫn đến chi tiết Hold trong Core. Bộ lọc `branchId` không phải ranh giới phân quyền: hiện Librarian được cấp quyền trên toàn hệ thống vì chưa có quan hệ phân công nhân viên–chi nhánh.

Job nhắc hạn chạy khi Insight khởi động và mỗi 15 phút, tạo thông báo khi Loan còn hạn trong 24 giờ. ID ổn định theo Loan và `dueAt`, cùng unique constraint/`skipDuplicates`, ngăn gửi trùng sau lần chạy lại hoặc khởi động lại; gia hạn làm thay đổi hạn và tạo một nhắc hạn riêng. Mặc định bật; `CIRCULATION_REMINDERS_ENABLED=false` tắt job. Lỗi được ghi log và thử lại ở chu kỳ kế tiếp. Đây là nhắc trong ứng dụng, không phải email/push hay cam kết gửi đúng thời điểm nếu Insight ngừng hoạt động.

## Dữ liệu và thứ tự xử lý

Prisma migration `202610250001_circulation_notifications` tạo hai bảng:

- `consumed_circulation_events`: eventId và SHA256 của dữ liệu chuẩn hóa, dùng nhận diện sự kiện trùng qua lần khởi động mới.
- `circulation_notices`: trạng thái mới nhất của từng Loan/Hold, có readerId, loại sự kiện, version, thời điểm nghiệp vụ và hạn trả/nhận nếu cần. Không lưu tên, email, token hoặc snapshot Catalog.

Migration `202610280001_reader_inbox` tạo `reader_notifications`, giữ một mục cho mỗi event được hiển thị cho Reader; ID event làm khóa duy nhất. Migration `202610300002_staff_work_inbox` tạo `staff_work_items`, lưu mã aggregate, chi nhánh và thời điểm mở/đóng; migration `202610300003_loan_due_reminders` dùng cùng bảng Reader Inbox cho nhắc hạn. API xác minh principal qua Core ở mỗi request và lọc theo readerId lấy từ phiên. Chi tiết và giới hạn vận hành ở [hộp thông báo](../02-kien-truc/hop-thong-bao.md).

Một transaction Insight ghi cả receipt và thông báo. Khóa advisory theo loại/UUID aggregate ngăn hai consumer cập nhật cạnh tranh. Event cũ vẫn được ghi nhận là đã đọc nhưng không ghi đè trạng thái có version cao hơn; HOLD_READY đến sau HOLD_EXPIRED không phục hồi lời nhắc nhận sách. Dùng lại eventId với nội dung khác, cùng version với eventId khác, hoặc đổi readerId của aggregate đều bị từ chối.

Consumer chỉ nhận envelope v1 và tám loại sự kiện được khai báo. Topic, record key, aggregateId, version trong data và trạng thái Loan/Hold phải khớp. Payload tối đa 64 KiB, version phải là số nguyên an toàn của JavaScript. Chuẩn hóa chỉ giữ trường cần thiết; trường thừa không được sao chép vào bảng hoặc DLQ. PostgreSQL giữ version bằng bigint; không nhận giá trị đã mất độ chính xác khi parse JSON.

## Retry, DLQ và offset

Consumer tắt auto-commit. Offset chỉ tăng sau khi transaction Insight đã commit hoặc broker đã ACK record ở `lams.notifications.dlq.v1`. Nếu tiến trình dừng giữa hai bước, record sẽ được giao lại; receipt ngăn ghi thông báo lần nữa.

Lỗi storage được thử tối đa năm lần trong một lần xử lý, chờ 250/500/1000/2000 ms và gọi heartbeat giữa các lần. Sau đó record được đưa DLQ. Lỗi envelope hoặc xung đột định danh đi DLQ ngay. Nếu DLQ không ACK, handler ném lỗi và giữ offset để KafkaJS kết nối/thử lại. Số lần retry trong bộ nhớ có thể bắt đầu lại sau restart; không có tuyên bố tổng số lần cố định xuyên mọi lần restart.

DLQ chứa topic/partition/offset nguồn, mã lỗi, hash payload và bản chuẩn hóa nếu envelope hợp lệ. Envelope lỗi chỉ giữ dấu vết nguồn/hash, không giữ raw payload có thể chứa secret hoặc thông tin thừa. DLQ có thể lặp nếu ACK thành công nhưng offset nguồn chưa commit; khóa record DLQ là bộ ba topic/partition/offset để đối chiếu, không phải cam kết broker tự loại trùng.

## Cấu hình và vận hành

`NOTIFICATIONS_ENABLED=false` là mặc định. Khi bật, phải chuẩn bị hai topic nguồn và DLQ trước, cấp quyền consume/commit cho group `NOTIFICATIONS_GROUP_ID` và produce DLQ. Không tự tạo topic từ ứng dụng. `KAFKA_BOOTSTRAP_SERVERS` dùng danh sách host:port. Consumer hiện dùng plaintext cho môi trường phát triển/nội bộ; cấu hình SASL/TLS và broker production chưa được triển khai ở client Insight.

Nếu bật nhưng không kết nối được khi khởi động, Insight báo lỗi khởi động rõ ràng. Khi đang chạy và broker gián đoạn, KafkaJS thử kết nối lại; shutdown đánh dấu đóng trước khi disconnect để không khởi động lại consumer đang được dừng. Prisma chỉ đóng ở bước application shutdown, sau consumer.

`GET /api/v1/health` thêm `notifications.enabled/connected`; status là DEGRADED nếu bật nhưng chưa tham gia group. HTTP 200 ở đây vẫn là liveness, không phải readiness và không chứng minh backlog đã xử lý hết. Theo dõi thêm consumer-group lag, số bản ghi DLQ và backlog outbox. Trạng thái kết nối có thể trễ cho đến khi client phát hiện mất broker.

Không bật hai phía trên môi trường dùng chung trước khi có volume, retention, replication, phân quyền và theo dõi broker. Cấu hình Compose development hiện chưa đáp ứng độ bền dữ liệu khi container bị tạo lại; xem [outbox](outbox-delivery.md).

## Khôi phục có kiểm soát

1. Đối chiếu mã lỗi và topic/partition/offset trong DLQ. Sửa kết nối/schema hoặc lỗi nghiệp vụ trước.
2. Lấy fact gốc còn trong topic nguồn; so hash với DLQ. Nếu không còn, phải đối chiếu outbox Core qua tài khoản vận hành được cấp quyền. Envelope lỗi không thể khôi phục từ record DLQ rút gọn một cách độc lập.
3. Kiểm nội dung và nguồn gốc, xác nhận phạm vi replay. Không sửa eventId để lách receipt, không xóa receipt hoặc thông báo đang có.
4. Gửi lại fact đã được xác nhận vào đúng topic/key, giữ eventId. Kiểm receipt và version mới nhất trong Insight; sự kiện cũ được ghi nhận nhưng không làm lùi trạng thái.
5. Ghi nhận offset/eventId đã khôi phục để tránh replay diện rộng ngoài phạm vi. Không reset cả consumer group hoặc xóa DLQ chỉ để giảm số lỗi.

Bước replay thực tế cần quyền/phê duyệt vận hành riêng. Bộ test chỉ thực hiện trên container tạm. Chưa có công cụ replay production tự động, job xóa receipt hoặc retention cho thông báo. Tài khoản bị vô hiệu hóa/xóa ở Core không tự xóa bản ghi Insight; trước pilot phải chốt thời hạn lưu, quyền truy cập hộp thông báo và cách xử lý tài khoản ngừng sử dụng. Cửa sổ giữ receipt phải dài hơn mọi cửa sổ replay được cho phép.

## Bằng chứng cần đối chiếu

Parser/processor có test kiểu dữ liệu, topic/key, phiên bản, nội dung thừa, retry và DLQ không ACK. Integration test dùng PostgreSQL/Kafka thật cho duplicate, out-of-order, cạnh tranh, transaction rollback, restart consumer/broker, lỗi storage năm lần và replay fact gốc. API hộp Reader và Work Inbox có test quyền/owner; job nhắc hạn kiểm cửa sổ 24 giờ và chống trùng khi chạy lại; frontend kiểm loading, lỗi, unread count và deep link đến giao dịch. E2E bật Kafka cô lập để đối chiếu Hold READY giữa Core, work item Librarian và thông báo Reader. Kết quả test/CI gắn với commit trong PR; chưa có bằng chứng email, push hoặc broker nhiều node.
