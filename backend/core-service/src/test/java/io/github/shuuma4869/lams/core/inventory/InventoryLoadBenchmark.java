package io.github.shuuma4869.lams.core.inventory;

import static org.assertj.core.api.Assertions.assertThat;

import io.github.shuuma4869.lams.core.inventory.audit.api.InventoryRequests;
import io.github.shuuma4869.lams.core.inventory.audit.application.InventorySessionService;
import java.util.Arrays;
import java.util.Locale;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

/** Chạy riêng: ./mvnw -Dtest=InventoryLoadBenchmark test */
@SpringBootTest
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
@Testcontainers
class InventoryLoadBenchmark {
    @Container static final PostgreSQLContainer<?> DB = new PostgreSQLContainer<>("postgres:17.6-alpine");

    @DynamicPropertySource static void database(DynamicPropertyRegistry properties) {
        properties.add("spring.datasource.url", DB::getJdbcUrl);
        properties.add("spring.datasource.username", DB::getUsername);
        properties.add("spring.datasource.password", DB::getPassword);
        properties.add("lams.auth.jwt-secret", () -> "inventory-load-test-secret-at-least-32-bytes");
    }

    @Autowired JdbcTemplate jdbc;
    @Autowired InventorySessionService service;

    @Test void openScanAndFinalizeAtFiveThousandCopies() {
        UUID actor = UUID.randomUUID(), branch = UUID.randomUUID(), shelf = UUID.randomUUID();
        UUID book = UUID.randomUUID(), edition = UUID.randomUUID();
        String code = actor.toString().substring(0, 20);
        String prefix = UUID.randomUUID().toString() + "-";
        jdbc.update("INSERT INTO users(id,member_code,email,email_normalized,full_name,password_hash,status,created_at,updated_at) VALUES (?,?,?,?,'Người kiểm thử','test-only','ACTIVE',now(),now())",
            actor, code, actor + "@test.local", actor + "@test.local");
        jdbc.update("INSERT INTO user_roles VALUES (?,'LIBRARIAN')", actor);
        jdbc.update("INSERT INTO branches(id,code,name) VALUES (?,?,'Chi nhánh thử tải')", branch, code);
        jdbc.update("INSERT INTO shelves(id,branch_id,code,label) VALUES (?,?,?,'Kệ thử tải')", shelf, branch, code);
        jdbc.update("INSERT INTO books(id,title,normalized_title) VALUES (?,'Sách thử tải','sach thu tai')", book);
        jdbc.update("INSERT INTO editions(id,book_id) VALUES (?,?)", edition, book);
        jdbc.update("INSERT INTO book_copies(id,edition_id,barcode,shelf_id,status) SELECT gen_random_uuid(),?,?||g,?,'AVAILABLE' FROM generate_series(1,5000) g",
            edition, prefix, shelf);

        long heapBefore = heapUsed();
        long started = System.nanoTime();
        var session = service.start(actor, new InventoryRequests.Start(UUID.randomUUID(), branch, shelf));
        long openMs = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started);
        assertThat(session.snapshotCount()).isEqualTo(5_000);

        long[] scanMs = new long[100];
        long sampledHeapMax = heapUsed();
        InventoryRequests.Scan first = null;
        for (int i = 0; i < scanMs.length; i++) {
            var scan = new InventoryRequests.Scan(UUID.randomUUID(), prefix + (i + 1), shelf, null);
            if (i == 0) first = scan;
            started = System.nanoTime();
            service.scan(actor, session.id(), scan);
            scanMs[i] = System.nanoTime() - started;
            sampledHeapMax = Math.max(sampledHeapMax, heapUsed());
        }
        started = System.nanoTime();
        service.scan(actor, session.id(), first);
        long replayMs = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM inventory_scans WHERE session_id=?", Integer.class, session.id())).isEqualTo(100);

        started = System.nanoTime();
        var closed = service.close(actor, session.id(), new InventoryRequests.Close(UUID.randomUUID(), 100L, null), false);
        long finalizeMs = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started);
        int missing = jdbc.queryForObject("SELECT count(*) FROM inventory_anomalies WHERE session_id=? AND kind='EXPECTED_BUT_MISSING'",
            Integer.class, session.id());
        assertThat(closed.status()).isEqualTo("FINALIZED");
        assertThat(missing).isEqualTo(4_900);
        long heapAfter = heapUsed();
        sampledHeapMax = Math.max(sampledHeapMax, heapAfter);
        long scanTotalNs = Arrays.stream(scanMs).sum();
        Arrays.sort(scanMs);
        System.out.printf(Locale.ROOT, "INVENTORY_LOAD copies=5000 scans=100 open_ms=%d scan_total_ms=%.1f "
                + "scan_p50_ms=%.1f scan_p95_ms=%.1f replay_ms=%d finalize_ms=%d missing=%d "
                + "heap_before_mb=%.1f heap_after_mb=%.1f sampled_heap_max_mb=%.1f%n",
            openMs, scanTotalNs / 1_000_000.0, scanMs[49] / 1_000_000.0, scanMs[94] / 1_000_000.0,
            replayMs, finalizeMs, missing, heapBefore / 1_048_576.0, heapAfter / 1_048_576.0,
            sampledHeapMax / 1_048_576.0);
    }

    private long heapUsed() {
        Runtime runtime = Runtime.getRuntime();
        return runtime.totalMemory() - runtime.freeMemory();
    }
}
