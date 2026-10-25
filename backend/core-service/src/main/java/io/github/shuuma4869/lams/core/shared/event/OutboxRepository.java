package io.github.shuuma4869.lams.core.shared.event;

import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class OutboxRepository {
    public record Pending(UUID id, String aggregateType, String aggregateId, String type, String payload, int retries) {}
    private final JdbcTemplate jdbc;
    public OutboxRepository(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public Optional<Pending> claim() {
        return jdbc.query("""
                SELECT o.* FROM outbox_events o
                WHERE o.published_at IS NULL AND o.next_attempt_at <= clock_timestamp()
                AND NOT EXISTS (SELECT 1 FROM outbox_events earlier
                    WHERE earlier.aggregate_type=o.aggregate_type AND earlier.aggregate_id=o.aggregate_id
                    AND earlier.published_at IS NULL AND earlier.delivery_order<o.delivery_order)
                ORDER BY o.delivery_order LIMIT 1 FOR UPDATE OF o SKIP LOCKED
                """, (r,n) -> new Pending(r.getObject("id", UUID.class), r.getString("aggregate_type"),
                r.getString("aggregate_id"), r.getString("event_type"), r.getString("payload"), r.getInt("retry_count")))
                .stream().findFirst();
    }
    public void published(UUID id) {
        jdbc.update("UPDATE outbox_events SET published_at=clock_timestamp(),last_error_code=NULL WHERE id=?", id);
    }
    public void retry(Pending record, String code) {
        int seconds = Math.min(3600, 5 * (1 << Math.min(record.retries(), 10)));
        jdbc.update("""
                UPDATE outbox_events SET retry_count=LEAST(retry_count::bigint+1,2147483647)::integer,
                next_attempt_at=clock_timestamp()+(? * interval '1 second'),last_error_code=? WHERE id=?
                """, seconds, code, record.id());
    }
}
