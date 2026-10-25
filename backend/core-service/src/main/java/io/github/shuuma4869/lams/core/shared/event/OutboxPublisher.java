package io.github.shuuma4869.lams.core.shared.event;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Set;
import java.util.concurrent.TimeUnit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
@ConditionalOnProperty(name="lams.outbox.enabled", havingValue="true")
public class OutboxPublisher {
    public enum Result { IDLE, SENT, RETRY }
    private static final Logger log = LoggerFactory.getLogger(OutboxPublisher.class);
    private static final Set<String> LOAN = Set.of("COPY_BORROWED", "COPY_RETURNED", "LOAN_RENEWED");
    private static final Set<String> HOLD = Set.of("HOLD_CREATED", "HOLD_READY", "HOLD_EXPIRED", "HOLD_CANCELLED", "HOLD_FULFILLED");
    private final OutboxRepository repository;
    private final KafkaTemplate<String, String> kafka;
    private final ObjectMapper json;
    public OutboxPublisher(OutboxRepository repository,
            @Qualifier("outboxKafkaTemplate") KafkaTemplate<String, String> kafka, ObjectMapper json) {
        this.repository = repository; this.kafka = kafka; this.json = json;
    }

    @Transactional(propagation=Propagation.REQUIRES_NEW, timeout=15)
    public Result publishOne() {
        var pending = repository.claim();
        if (pending.isEmpty()) return Result.IDLE;
        var record = pending.get();
        String topic = topic(record);
        if (topic == null || !validEnvelope(record)) {
            repository.retry(record, "INVALID_ENVELOPE");
            log.warn("Outbox {} chưa gửi: envelope hoặc loại sự kiện không hợp lệ.", record.id());
            return Result.RETRY;
        }
        try {
            // StringSerializer gửi đúng JSON đã lưu, không bọc thêm chuỗi JSON.
            kafka.send(topic, record.aggregateId(), record.payload()).get(8, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            repository.retry(record, "INTERRUPTED");
            return Result.RETRY;
        } catch (Exception e) {
            repository.retry(record, "BROKER_UNCONFIRMED");
            log.warn("Outbox {} chưa có xác nhận broker; giữ lại để thử sau.", record.id());
            return Result.RETRY;
        }
        // Lỗi DB ở đây phải rollback: lần sau gửi lại cùng eventId, consumer cần dedupe.
        repository.published(record.id());
        return Result.SENT;
    }
    private String topic(OutboxRepository.Pending r) {
        if (r.aggregateType().equals("LOAN") && LOAN.contains(r.type())) return "lams.circulation.events.v1";
        if (r.aggregateType().equals("HOLD") && HOLD.contains(r.type())) return "lams.hold.events.v1";
        return null;
    }
    private boolean validEnvelope(OutboxRepository.Pending r) {
        try {
            var value = json.readTree(r.payload());
            return value.isObject() && value.path("eventId").asText().equals(r.id().toString())
                && value.path("aggregateId").asText().equals(r.aggregateId())
                && value.path("eventType").asText().equals(r.type())
                && value.path("version").isIntegralNumber() && value.path("version").canConvertToInt() && value.path("version").asInt() == 1
                && value.path("aggregateVersion").isIntegralNumber() && value.path("aggregateVersion").canConvertToLong()
                && value.path("aggregateVersion").asLong() >= 0 && value.path("data").isObject()
                && java.time.Instant.parse(value.path("occurredAt").asText()) != null;
        } catch (Exception e) { return false; }
    }
}
