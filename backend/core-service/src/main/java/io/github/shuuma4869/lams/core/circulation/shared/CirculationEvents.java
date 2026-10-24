package io.github.shuuma4869.lams.core.circulation.shared;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Component
public class CirculationEvents {
    private final JdbcTemplate jdbc;
    private final CommandExecutor json;
    public CirculationEvents(JdbcTemplate jdbc, CommandExecutor json) { this.jdbc = jdbc; this.json = json; }
    @Transactional(propagation = Propagation.MANDATORY)
    public void append(String aggregate, UUID id, long revision, String type, Object data, Instant now) {
        UUID eventId = UUID.randomUUID();
        var envelope = Map.of("eventId", eventId, "eventType", type, "occurredAt", now, "aggregateId", id,
                "version", 1, "aggregateVersion", revision, "data", data);
        jdbc.update("INSERT INTO outbox_events(id,aggregate_type,aggregate_id,event_type,payload,occurred_at) VALUES (?,?,?,?,?::jsonb,?)",
                eventId, aggregate, id.toString(), type, json.encode(envelope), Timestamp.from(now));
    }
}
