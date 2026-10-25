package io.github.shuuma4869.lams.core.hold;

import static org.assertj.core.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import io.github.shuuma4869.lams.core.circulation.loan.api.BorrowRequest;
import io.github.shuuma4869.lams.core.circulation.loan.application.LoanCommandService;
import io.github.shuuma4869.lams.core.circulation.shared.VersionedRequest;
import io.github.shuuma4869.lams.core.hold.api.HoldRequest;
import io.github.shuuma4869.lams.core.hold.application.HoldEtaService;
import io.github.shuuma4869.lams.core.hold.application.HoldService;
import io.github.shuuma4869.lams.core.hold.domain.Hold;
import io.github.shuuma4869.lams.core.inventory.copy.application.CopyStateService;
import java.time.*;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@SpringBootTest(properties="lams.circulation.hold-job-enabled=false")
@AutoConfigureMockMvc
@Import(HoldEtaIntegrationTest.TimeConfig.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
@Testcontainers
class HoldEtaIntegrationTest {
    @Container static final PostgreSQLContainer<?> DB = new PostgreSQLContainer<>("postgres:17.6-alpine");
    @DynamicPropertySource static void database(DynamicPropertyRegistry p) {
        p.add("spring.datasource.url", DB::getJdbcUrl); p.add("spring.datasource.username", DB::getUsername);
        p.add("spring.datasource.password", DB::getPassword); p.add("lams.auth.jwt-secret", () -> "eta-integration-test-secret-at-least-32-bytes");
    }
    static class TestClock extends Clock {
        Instant value;
        public Instant instant() { return value; }
        public ZoneId getZone() { return ZoneOffset.UTC; }
        public Clock withZone(ZoneId zone) { return Clock.fixed(value, zone); }
    }
    @TestConfiguration static class TimeConfig { @Bean @Primary TestClock clock() { return new TestClock(); } }
    @Autowired TestClock clock;
    @Autowired JdbcTemplate jdbc;
    @Autowired HoldService holds;
    @Autowired HoldEtaService eta;
    @Autowired LoanCommandService loans;
    @Autowired CopyStateService states;
    @Autowired MockMvc mvc;
    @BeforeEach void now() { clock.value = Instant.now().truncatedTo(java.time.temporal.ChronoUnit.MICROS); }
    record Fixture(UUID staff, UUID reader, UUID book, UUID edition, UUID branch, UUID copy) {}

    @Test void dueDateAndQueueChangesAreReadFromDatabaseWithoutWritingFacts() {
        var f = fixture(); available(f);
        var loan = loans.borrow(f.staff, new BorrowRequest(UUID.randomUUID(), f.copy, user("READER"), f.branch, 1L));
        var first = hold(f, user("READER")); clock.value = clock.value.plusSeconds(1); var target = hold(f, f.reader);
        long outbox = count("outbox_events"), changes = count("hold_changes");
        var estimate = eta.estimate(f.reader, target.id());
        assertThat(estimate.reason()).isEqualTo("CONDITIONAL"); assertThat(estimate.waitingAhead()).isEqualTo(1);
        assertThat(estimate.estimatedAt()).isEqualTo(loan.dueAt().plus(Duration.ofDays(16)));
        assertThat(estimate.asOf()).isEqualTo(clock.instant()); assertThat(estimate.holdVersion()).isZero();
        assertThat(count("outbox_events")).isEqualTo(outbox); assertThat(count("hold_changes")).isEqualTo(changes);
        holds.cancel(first.readerId(), first.id(), new VersionedRequest(UUID.randomUUID(), 0L));
        var changed = eta.estimate(f.reader, target.id()); assertThat(changed.waitingAhead()).isZero();
        assertThat(changed.estimatedAt()).isEqualTo(loan.dueAt());
        clock.value = loan.dueAt(); assertThat(eta.estimate(f.reader, target.id()).reason()).isEqualTo("OVERDUE_COPY");
        assertThat(eta.estimate(f.reader, target.id()).estimatedAt()).isNull();
    }
    @Test void unavailableCopyDisabledBranchAndReaderDoNotProduceDates() {
        var f = fixture(); var hold = hold(f, f.reader);
        assertThat(eta.estimate(f.reader, hold.id()).reason()).isEqualTo("NO_COMPATIBLE_COPY");
        jdbc.update("UPDATE branches SET status='DISABLED' WHERE id=?", f.branch);
        assertThat(eta.estimate(f.reader, hold.id()).reason()).isEqualTo("BRANCH_INACTIVE");
        jdbc.update("UPDATE branches SET status='ACTIVE' WHERE id=?", f.branch);
        jdbc.update("UPDATE users SET status='LOCKED' WHERE id=?", f.reader);
        assertThat(eta.estimate(f.staff, hold.id()).reason()).isEqualTo("READER_INELIGIBLE");
    }
    @Test void readyExpiredAndClosedAreNotFuturePredictions() {
        var f = fixture(); available(f); var hold = hold(f, f.reader);
        assertThat(eta.estimate(f.reader, hold.id()).reason()).isEqualTo("READY");
        assertThat(eta.estimate(f.reader, hold.id()).estimatedAt()).isNull();
        clock.value = hold.expiresAt(); assertThat(eta.estimate(f.reader, hold.id()).reason()).isEqualTo("AWAITING_EXPIRY");
        holds.cancel(f.reader, hold.id(), new VersionedRequest(UUID.randomUUID(), hold.version()));
        assertThat(eta.estimate(f.reader, hold.id()).reason()).isEqualTo("CLOSED");
    }
    @Test void ownerAndCurrentStaffOnlyGetPrivateReadModel() throws Exception {
        var f = fixture(); var hold = hold(f, f.reader); String path = "/api/v1/holds/" + hold.id() + "/estimate";
        mvc.perform(get(path)).andExpect(status().isUnauthorized());
        var other = jwt().jwt(j -> j.subject(user("READER").toString())).authorities(new SimpleGrantedAuthority("ROLE_READER"));
        mvc.perform(get(path).with(other)).andExpect(status().isForbidden());
        var owner = jwt().jwt(j -> j.subject(f.reader.toString())).authorities(new SimpleGrantedAuthority("ROLE_READER"));
        mvc.perform(get(path).with(owner)).andExpect(status().isOk()).andExpect(jsonPath("$.reason").value("NO_COMPATIBLE_COPY"))
                .andExpect(jsonPath("$.readerId").doesNotExist()).andExpect(jsonPath("$.estimatedAt").isEmpty());
        var staff = jwt().jwt(j -> j.subject(f.staff.toString())).authorities(new SimpleGrantedAuthority("ROLE_LIBRARIAN"));
        mvc.perform(get(path).with(staff)).andExpect(status().isOk());
        jdbc.update("DELETE FROM user_roles WHERE user_id=?", f.staff);
        mvc.perform(get(path).with(staff)).andExpect(status().isForbidden());
        jdbc.update("UPDATE users SET status='DISABLED' WHERE id=?", f.reader);
        mvc.perform(get(path).with(owner)).andExpect(status().isForbidden());
    }
    @Test void contradictoryCopyStateDoesNotTurnIntoAnEstimate() {
        var f = fixture(); var hold = hold(f, f.reader);
        jdbc.update("UPDATE book_copies SET status='ON_LOAN' WHERE id=?", f.copy);
        assertThat(eta.estimate(f.reader, hold.id()).reason()).isEqualTo("INCONSISTENT_COPY");
    }
    @Test void reservedCopyIncludesRemainingPickupAndOneLoanWithoutPretendingItIsFree() {
        var f = fixture(); available(f); var ready = hold(f, user("READER")); var waiting = hold(f, f.reader);
        var estimate = eta.estimate(f.reader, waiting.id());
        assertThat(estimate.estimatedAt()).isEqualTo(ready.expiresAt().plus(Duration.ofDays(14)));
        clock.value = ready.expiresAt();
        assertThat(eta.estimate(f.reader, waiting.id()).reason()).isEqualTo("AWAITING_EXPIRY");
    }
    @Test void excessiveScopeReturnsReasonInsteadOfSilentlyTruncatingSimulation() {
        var f = fixture(); var hold = hold(f, f.reader);
        UUID shelf = jdbc.queryForObject("SELECT shelf_id FROM book_copies WHERE id=?", UUID.class, f.copy);
        jdbc.update("""
                INSERT INTO book_copies(id,edition_id,barcode,shelf_id,status)
                SELECT gen_random_uuid(),?,?||g,?,'AVAILABLE' FROM generate_series(1,501) g
                """, f.edition, UUID.randomUUID().toString(), shelf);
        var estimate = eta.estimate(f.reader, hold.id());
        assertThat(estimate.reason()).isEqualTo("SCOPE_TOO_LARGE"); assertThat(estimate.estimatedAt()).isNull();
    }
    private Fixture fixture() {
        UUID staff = user("LIBRARIAN"), reader = user("READER"), book = UUID.randomUUID(), edition = UUID.randomUUID();
        UUID branch = UUID.randomUUID(), shelf = UUID.randomUUID(), copy = UUID.randomUUID();
        jdbc.update("INSERT INTO books(id,title,normalized_title) VALUES (?,'Sách ETA','sach eta')", book);
        jdbc.update("INSERT INTO editions(id,book_id) VALUES (?,?)", edition, book);
        jdbc.update("INSERT INTO branches(id,code,name) VALUES (?,?,'Chi nhánh ETA')", branch, branch.toString().substring(0,20));
        jdbc.update("INSERT INTO shelves(id,branch_id,code,label) VALUES (?,?,'S1','Kệ ETA')", shelf, branch);
        jdbc.update("INSERT INTO book_copies(id,edition_id,barcode,shelf_id) VALUES (?,?,?,?)", copy, edition, copy.toString(), shelf);
        return new Fixture(staff, reader, book, edition, branch, copy);
    }
    private void available(Fixture f) { states.change(f.staff, f.copy, UUID.randomUUID(), 0, "AVAILABLE", "Kiểm thử ETA"); }
    private Hold hold(Fixture f, UUID reader) { return holds.create(reader, new HoldRequest(UUID.randomUUID(), f.book, f.branch, f.edition, false)); }
    private UUID user(String role) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO users(id,member_code,email,email_normalized,full_name,password_hash,status,created_at,updated_at)
                VALUES (?,?,?,?,'Người thử ETA','test-only','ACTIVE',now(),now())
                """, id, id.toString().substring(0,20), id+"@test.local", id+"@test.local");
        jdbc.update("INSERT INTO user_roles VALUES (?,?)", id, role); return id;
    }
    private long count(String table) { return jdbc.queryForObject("SELECT count(*) FROM " + table, Long.class); }
}
