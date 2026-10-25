# Gửi sự kiện lưu thông qua outbox

Core ghi fact cùng giao dịch mượn/trả hoặc giữ chỗ. `OutboxPublisher` đọc fact đã commit và gửi JSON nguyên bản sang Kafka; API nghiệp vụ không phải đợi broker. Publisher nằm trong `shared/event`, dùng V19 để bổ sung thứ tự giao nhận, thời điểm thử lại và mã lỗi. V1–V18 không thay checksum.

## Bật và cấu hình

Mặc định `OUTBOX_ENABLED=false`. Khi tắt, fact vẫn được lưu trong PostgreSQL. `OUTBOX_JOB_ENABLED` chỉ điều khiển lịch chạy; môi trường kiểm thử gọi publisher trực tiếp. Chuẩn bị hai topic trước khi bật:

| Topic | Loại sự kiện | Record key |
|---|---|---|
| `lams.circulation.events.v1` | COPY_BORROWED, COPY_RETURNED, LOAN_RENEWED | UUID Loan |
| `lams.hold.events.v1` | HOLD_CREATED, HOLD_READY, HOLD_EXPIRED, HOLD_CANCELLED, HOLD_FULFILLED | UUID Hold |

Broker lấy từ `KAFKA_BOOTSTRAP_SERVERS`. Cấu hình SASL/TLS dùng các thuộc tính `spring.kafka` tương ứng của Spring Boot, không đưa credential vào source. Compose hiện chỉ phù hợp phát triển: một broker, plaintext, chưa có volume Kafka bền vững. Không bật pipeline dùng chung chỉ vì Compose báo healthy; cần kiểm volume, backup, replication, retention và consumer trước. Khi container broker bị tạo lại, dữ liệu đã ACK có thể mất; `published_at` trong Core không tự phát hiện hoặc phục hồi trường hợp đó.

Consumer Insight được bổ sung sau PR publisher; xem [tiếp nhận sự kiện](circulation-notifications.md) để kiểm dedupe, thứ tự và DLQ. Chưa có hộp thông báo UI. Hai phía mặc định tắt; không bật publisher trên production trong đợt này.

## Khóa, ACK và retry

Mỗi lần gửi dùng transaction riêng (`REQUIRES_NEW`, timeout 15 giây). `FOR UPDATE SKIP LOCKED` chọn một fact đến hạn; một aggregate còn fact cũ chưa gửi thì fact sau chưa được vượt qua. Các aggregate khác vẫn có thể được worker khác xử lý. Backlog trước V19 được xếp theo thời điểm và aggregateVersion; các fact mới nhận số thứ tự khi INSERT.

Producer dùng `acks=all`, idempotence của Kafka producer và JSON string serializer. Chờ ACK tối đa tám giây sau bước gửi; producer chặn metadata tối đa ba giây, delivery timeout năm giây. Chỉ ghi `published_at` sau ACK. Không có transaction phân tán PostgreSQL/Kafka: crash hoặc lỗi DB sau ACK làm lần sau gửi lại đúng eventId/payload. Idempotence của producer không loại bỏ lặp khi tạo lại producer. Consumer bắt buộc dedupe bền vững theo eventId và kiểm aggregateVersion, kể cả khi record key giữ cùng partition.

Lỗi gửi tăng retry_count và đặt lịch thử lại 5, 10, 20… giây, tối đa một giờ. Số lần retry được chặn ở giới hạn integer, không xóa fact hoặc đánh dấu thành công khi hết số lần. Envelope/loại sự kiện sai cũng giữ lại, có mã `INVALID_ENVELOPE`; nhân viên vận hành phải xử lý nguyên nhân để aggregate đó tiếp tục. Không log payload hoặc exception chứa dữ liệu người mượn. Job chạy mỗi năm giây, tối đa 20 lần gửi một vòng và dừng vòng khi gặp lỗi; scheduler riêng để không chặn job hết hạn Hold.

## Theo dõi và khôi phục

Chỉ chạy truy vấn bằng tài khoản vận hành được cấp quyền; không có API public sửa outbox:

```sql
SELECT count(*) AS pending, min(occurred_at) AS oldest_pending,
       max(retry_count) AS highest_retry
FROM outbox_events WHERE published_at IS NULL;

SELECT last_error_code, count(*)
FROM outbox_events WHERE published_at IS NULL
GROUP BY last_error_code;
```

Khi broker lỗi, sửa kết nối/topic/quyền và đợi lịch retry. Không cần đặt `published_at` về NULL và không tạo eventId mới. Khi DB lỗi sau ACK, để publisher gửi lại; consumer sẽ cần nhận diện trùng. Với envelope lỗi, dừng publisher, xác định nguồn lỗi và duyệt cách sửa từng fact; không xóa fact để làm giảm backlog. Việc sửa dữ liệu vận hành hoặc replay dữ liệu đã ACK cần phê duyệt riêng, bản sao lưu và phạm vi rõ ràng. Tài liệu này không thực hiện replay/xóa dữ liệu production.

Chưa có job retention cho fact đã gửi; PostgreSQL sẽ tăng dung lượng. Chưa có dashboard/cảnh báo backlog tự động hoặc cam kết SLA. Trước pilot phải chốt thời gian giữ outbox và Kafka, phân quyền vận hành, cơ chế replay có kiểm soát, cũng như dedupe retention dài hơn cửa sổ replay.

## Kiểm chứng

`OutboxPublisherIntegrationTest` dùng PostgreSQL và Kafka thật trong container tạm: broker bị pause, giao dịch mượn đã commit, retry/backoff, rollback trước publish, hai worker, lỗi DB sau ACK và tạo lại producer, định tuyến Loan/Hold, envelope lỗi. `OutboxMigrationTest` nâng V18 có backlog cố ý insert ngược thứ tự, kiểm không mất fact/retry và sequence cho fact mới. Đây là test publisher; chưa chứng minh consumer, thông báo, multi-broker failover hay độ bền dữ liệu khi container Kafka development bị tạo lại.
