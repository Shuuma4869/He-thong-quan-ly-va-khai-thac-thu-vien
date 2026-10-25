package io.github.shuuma4869.lams.core.shared.event;

import static org.assertj.core.api.Assertions.*;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@Testcontainers
class OutboxMigrationTest {
    @Container static final PostgreSQLContainer<?> DB = new PostgreSQLContainer<>("postgres:17.6-alpine");
    @Test void upgradeRetainsBacklogAndOrdersSameTimestampByAggregateVersion() {
        Flyway.configure().dataSource(DB.getJdbcUrl(), DB.getUsername(), DB.getPassword()).target("18").load().migrate();
        var jdbc = new JdbcTemplate(new DriverManagerDataSource(DB.getJdbcUrl(), DB.getUsername(), DB.getPassword()));
        UUID aggregate = UUID.randomUUID(), first = UUID.randomUUID(), second = UUID.randomUUID();
        // Backlog cố ý được insert ngược thứ tự để kiểm tra backfill thay vì dựa vào heap order.
        jdbc.update("INSERT INTO outbox_events(id,aggregate_type,aggregate_id,event_type,payload,occurred_at,retry_count) VALUES (?,'LOAN',?,'LOAN_RENEWED','{\"aggregateVersion\":1}',TIMESTAMPTZ '2026-10-25 00:00:00Z',2)", second, aggregate.toString());
        jdbc.update("INSERT INTO outbox_events(id,aggregate_type,aggregate_id,event_type,payload,occurred_at) VALUES (?,'LOAN',?,'COPY_BORROWED','{\"aggregateVersion\":0}',TIMESTAMPTZ '2026-10-25 00:00:00Z')", first, aggregate.toString());
        Flyway.configure().dataSource(DB.getJdbcUrl(), DB.getUsername(), DB.getPassword()).load().migrate();
        assertThat(jdbc.queryForList("SELECT id FROM outbox_events ORDER BY delivery_order", UUID.class)).containsExactly(first, second);
        assertThat(jdbc.queryForObject("SELECT retry_count FROM outbox_events WHERE id=?", Integer.class, second)).isEqualTo(2);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM outbox_events WHERE published_at IS NULL AND next_attempt_at IS NOT NULL", Integer.class)).isEqualTo(2);
        jdbc.update("INSERT INTO outbox_events(id,aggregate_type,aggregate_id,event_type,payload,occurred_at) VALUES (?,'LOAN',?,'COPY_RETURNED','{}',now())", UUID.randomUUID(), aggregate.toString());
        assertThat(jdbc.queryForObject("SELECT max(delivery_order) FROM outbox_events", Long.class)).isEqualTo(3L);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM outbox_events", Integer.class)).isEqualTo(3);
    }
}
