package io.github.shuuma4869.lams.core.inventory;

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
class InventorySessionMigrationTest {
    @Container static final PostgreSQLContainer<?> DB=new PostgreSQLContainer<>("postgres:17.6-alpine");
    @Test void upgradeKeepsOutboxAndCatalogAndAddsInventoryTables(){
        Flyway.configure().dataSource(DB.getJdbcUrl(),DB.getUsername(),DB.getPassword()).target("19").load().migrate();
        var jdbc=new JdbcTemplate(new DriverManagerDataSource(DB.getJdbcUrl(),DB.getUsername(),DB.getPassword()));
        UUID book=UUID.randomUUID(),event=UUID.randomUUID();
        jdbc.update("INSERT INTO books(id,title,normalized_title) VALUES (?,'Sách cũ','sach cu')",book);
        jdbc.update("INSERT INTO outbox_events(id,aggregate_type,aggregate_id,event_type,payload,occurred_at,retry_count) VALUES (?,'LOAN',?,'COPY_BORROWED','{}',now(),3)",event,UUID.randomUUID().toString());
        Flyway.configure().dataSource(DB.getJdbcUrl(),DB.getUsername(),DB.getPassword()).load().migrate();
        assertThat(jdbc.queryForObject("SELECT title FROM books WHERE id=?",String.class,book)).isEqualTo("Sách cũ");
        assertThat(jdbc.queryForObject("SELECT retry_count FROM outbox_events WHERE id=?",Integer.class,event)).isEqualTo(3);
        for(String table:new String[]{"inventory_sessions","inventory_snapshots","inventory_scans","inventory_anomalies","inventory_resolutions"})
            assertThat(jdbc.queryForObject("SELECT to_regclass(?) IS NOT NULL",Boolean.class,table)).isTrue();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM inventory_sessions",Integer.class)).isZero();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM flyway_schema_history WHERE success AND version='20'",Integer.class)).isOne();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM flyway_schema_history WHERE success AND version='21'",Integer.class)).isOne();
    }
}
