package io.github.shuuma4869.lams.core.circulation.loan;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.github.shuuma4869.lams.core.circulation.loan.api.BorrowRequest;
import io.github.shuuma4869.lams.core.circulation.loan.api.ReturnRequest;
import io.github.shuuma4869.lams.core.circulation.loan.api.LoanCommandResult;
import io.github.shuuma4869.lams.core.circulation.loan.application.LoanCommandService;
import io.github.shuuma4869.lams.core.circulation.shared.CommandExecutor;
import io.github.shuuma4869.lams.core.identity.application.AuthFailure;
import io.github.shuuma4869.lams.core.inventory.copy.application.CopyStateService;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@SpringBootTest
@AutoConfigureMockMvc
@org.springframework.test.annotation.DirtiesContext(classMode = org.springframework.test.annotation.DirtiesContext.ClassMode.AFTER_CLASS)
@Testcontainers
class LoanCommandIntegrationTest {
    @Container static final PostgreSQLContainer<?> DB = new PostgreSQLContainer<>("postgres:17.6-alpine");
    @DynamicPropertySource static void database(DynamicPropertyRegistry p) {
        p.add("spring.datasource.url", DB::getJdbcUrl);
        p.add("spring.datasource.username", DB::getUsername);
        p.add("spring.datasource.password", DB::getPassword);
        p.add("lams.auth.jwt-secret", () -> "circulation-integration-test-secret-32-bytes");
        p.add("lams.circulation.policy.max-active-loans", () -> "1");
    }
    @Autowired JdbcTemplate jdbc;
    @Autowired LoanCommandService commands;
    @Autowired CopyStateService states;
    @Autowired CommandExecutor executor;
    @Autowired ObjectMapper json;
    @Autowired MockMvc mvc;
    @Autowired PlatformTransactionManager transactions;

    record Fixture(UUID staff, UUID reader, UUID book, UUID edition, UUID branch, UUID shelf, UUID copy) {
        BorrowRequest borrow() { return new BorrowRequest(UUID.randomUUID(), copy, reader, branch, 1L); }
    }

    @Test void borrowAndReturnPersistTogetherAndReplaysKeepTheOriginalResponse() throws Exception {
        var f = fixture(); var request = f.borrow();
        var loan = commands.borrow(f.staff, request);
        assertThat(loan.copyVersion()).isEqualTo(2);
        assertThat(loan.dueAt()).isEqualTo(loan.borrowedAt().plusSeconds(14 * 86400));
        assertThat(copyStatus(f.copy)).isEqualTo("ON_LOAN");
        assertThat(count("loans", "reader_id", f.reader)).isOne();
        assertThat(count("copy_state_changes", "copy_id", f.copy)).isEqualTo(2);
        var returned = commands.returnLoan(f.staff, loan.loanId(), new ReturnRequest(UUID.randomUUID(), f.branch, 0L));
        assertThat(returned.returnedAt()).isNotNull();
        assertThat(returned.version()).isEqualTo(1);
        assertThat(copyStatus(f.copy)).isEqualTo("AVAILABLE");
        assertThat(commands.borrow(f.staff, request)).isEqualTo(loan);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM outbox_events WHERE aggregate_id=?",
                Integer.class, loan.loanId().toString())).isEqualTo(2);
        var event = json.readTree(jdbc.queryForObject("SELECT payload::text FROM outbox_events WHERE aggregate_id=? AND event_type='COPY_BORROWED'",
                String.class, loan.loanId().toString()));
        assertThat(event.path("aggregateVersion").asLong()).isZero();
        assertThat(event.path("data").has("email")).isFalse();
        assertThat(jdbc.queryForObject("SELECT policy_snapshot->>'version' FROM loans WHERE id=?", String.class,
                loan.loanId())).isEqualTo("dev-provisional-v1");
    }

    @Test void manualStateChangeIsVersionedAuditedAndCannotBypassCirculation() {
        var f = fixture(); UUID key = UUID.randomUUID();
        var damaged = states.change(f.staff, f.copy, key, 1, "DAMAGED", "Rách trang");
        assertThat(states.change(f.staff, f.copy, key, 1, "DAMAGED", "Rách trang")).isEqualTo(damaged);
        failure(409, () -> states.change(f.staff, f.copy, UUID.randomUUID(), 1, "LOST", "Không tìm thấy"));
        failure(409, () -> states.change(f.staff, f.copy, key, 1, "DAMAGED", "Đổi lý do"));
        failure(409, () -> states.change(f.staff, f.copy, UUID.randomUUID(), 2, "ON_LOAN", "Bỏ qua giao dịch"));
        states.change(f.staff, f.copy, UUID.randomUUID(), 2, "WITHDRAWN", "Không sửa được");
        failure(409, () -> states.change(f.staff, f.copy, UUID.randomUUID(), 3, "AVAILABLE", "Khôi phục"));
        assertThat(count("copy_state_changes", "copy_id", f.copy)).isEqualTo(3);
    }

    @Test void returnRejectsWrongBranchStaleVersionAndSecondCommandButAllowsRetry() {
        var f = fixture(); var loan = commands.borrow(f.staff, f.borrow());
        failure(409, () -> commands.returnLoan(f.staff, loan.loanId(), new ReturnRequest(UUID.randomUUID(), UUID.randomUUID(), 0L)));
        failure(409, () -> commands.returnLoan(f.staff, loan.loanId(), new ReturnRequest(UUID.randomUUID(), f.branch, 1L)));
        assertThat(copyStatus(f.copy)).isEqualTo("ON_LOAN");
        var request = new ReturnRequest(UUID.randomUUID(), f.branch, 0L);
        jdbc.update("UPDATE users SET status='LOCKED' WHERE id=?", f.reader);
        var returned = commands.returnLoan(f.staff, loan.loanId(), request);
        assertThat(commands.returnLoan(f.staff, loan.loanId(), request)).isEqualTo(returned);
        failure(409, () -> commands.returnLoan(f.staff, loan.loanId(), new ReturnRequest(UUID.randomUUID(), f.branch, 1L)));
    }

    @Test void sameRequestKeyCannotChangeCopyReaderOrCommandAndIsScopedToActor() {
        var f = fixture(); var request = f.borrow(); var loan = commands.borrow(f.staff, request);
        failure(409, () -> commands.borrow(f.staff, new BorrowRequest(request.requestId(), f.copy, user("READER"), f.branch, 1L)));
        failure(409, () -> commands.returnLoan(f.staff, loan.loanId(), new ReturnRequest(request.requestId(), f.branch, 0L)));
        UUID otherStaff = user("LIBRARIAN");
        commands.returnLoan(otherStaff, loan.loanId(), new ReturnRequest(request.requestId(), f.branch, 0L));
        assertThat(jdbc.queryForObject("SELECT count(*) FROM circulation_requests WHERE request_id=?", Integer.class,
                request.requestId())).isEqualTo(2);
    }

    @Test void unavailableMissingWrongBranchAndInactiveReaderNeverProduceLoan() {
        var f = fixture();
        failure(404, () -> commands.borrow(f.staff, new BorrowRequest(UUID.randomUUID(), UUID.randomUUID(), f.reader, f.branch, 1L)));
        failure(404, () -> commands.borrow(f.staff, new BorrowRequest(UUID.randomUUID(), f.copy, UUID.randomUUID(), f.branch, 1L)));
        failure(409, () -> commands.borrow(f.staff, new BorrowRequest(UUID.randomUUID(), f.copy, f.reader, UUID.randomUUID(), 1L)));
        for (String state : List.of("LOCKED", "DISABLED")) {
            jdbc.update("UPDATE users SET status=? WHERE id=?", state, f.reader);
            failure(409, () -> commands.borrow(f.staff, f.borrow()));
        }
        jdbc.update("UPDATE users SET status='ACTIVE' WHERE id=?", f.reader);
        jdbc.update("DELETE FROM user_roles WHERE user_id=?", f.reader);
        failure(409, () -> commands.borrow(f.staff, f.borrow()));
        assertThat(count("loans", "copy_id", f.copy)).isZero();
        assertThat(copyStatus(f.copy)).isEqualTo("AVAILABLE");
    }

    @Test void quotaIsCheckedFromDatabaseNotFromClient() {
        var f = fixture(); var first = commands.borrow(f.staff, f.borrow()); UUID second = copy(f.edition, f.shelf);
        failure(409, () -> commands.borrow(f.staff, new BorrowRequest(UUID.randomUUID(), second, f.reader, f.branch, 0L)));
        jdbc.update("UPDATE loans SET borrowed_at=?,due_at=? WHERE id=?",
                Timestamp.from(Instant.now().minusSeconds(7200)), Timestamp.from(Instant.now().minusSeconds(3600)), first.loanId());
        assertThat(count("loans", "reader_id", f.reader)).isOne();
    }

    @Test void httpRequiresCurrentStaffRoleAndValidRequestEvenWhenJwtClaimsAreStale() throws Exception {
        var f = fixture(); String payload = json.writeValueAsString(f.borrow());
        mvc.perform(post("/api/v1/loans").contentType("application/json").content(payload)).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/v1/loans").with(jwt().jwt(j -> j.subject(f.reader.toString()))
                .authorities(new SimpleGrantedAuthority("ROLE_READER"))).contentType("application/json").content(payload))
                .andExpect(status().isForbidden());
        var staff = jwt().jwt(j -> j.subject(f.staff.toString())).authorities(new SimpleGrantedAuthority("ROLE_LIBRARIAN"));
        mvc.perform(post("/api/v1/loans").with(staff).contentType("application/json").content("{}"))
                .andExpect(status().isUnprocessableEntity());
        for (String invalid : List.of("1.9", "\"1\"", "true", "9223372036854775808")) {
            mvc.perform(post("/api/v1/loans").with(staff).contentType("application/json")
                    .content(payload.replace("\"copyVersion\":1", "\"copyVersion\":" + invalid)))
                    .andExpect(status().isBadRequest());
        }
        var result = mvc.perform(post("/api/v1/loans").with(staff).contentType("application/json").content(payload))
                .andExpect(status().isCreated()).andReturn();
        assertThat(json.readTree(result.getResponse().getContentAsString()).has("policySnapshot")).isFalse();
        jdbc.update("DELETE FROM user_roles WHERE user_id=?", f.staff);
        mvc.perform(post("/api/v1/loans").with(staff).contentType("application/json").content(payload)).andExpect(status().isForbidden());
        jdbc.update("INSERT INTO user_roles VALUES (?,'LIBRARIAN')", f.staff);
        jdbc.update("UPDATE users SET status='LOCKED' WHERE id=?", f.staff);
        mvc.perform(post("/api/v1/loans").with(staff).contentType("application/json").content(payload)).andExpect(status().isForbidden());
    }

    @Test void rollbackAfterBusinessWritesRemovesLoanCopyChangeOutboxAndReceipt() {
        var f = fixture(); var request = f.borrow();
        var tx = new TransactionTemplate(transactions);
        assertThatThrownBy(() -> tx.executeWithoutResult(s -> {
            commands.borrow(f.staff, request);
            throw new IllegalStateException("Lỗi sau khi ghi nghiệp vụ");
        })).isInstanceOf(IllegalStateException.class);
        assertThat(count("loans", "copy_id", f.copy)).isZero();
        assertThat(copyStatus(f.copy)).isEqualTo("AVAILABLE");
        assertThat(count("copy_state_changes", "copy_id", f.copy)).isOne();
        assertThat(count("circulation_requests", "request_id", request.requestId())).isZero();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM outbox_events WHERE payload->'data'->>'copyId'=?",
                Integer.class, f.copy.toString())).isZero();
        commands.borrow(f.staff, request);
    }

    @Test void twoReadersRaceForLastCopyOneCreatedOneConflict() throws Exception {
        var f = fixture(); var a = f.borrow();
        var b = new BorrowRequest(UUID.randomUUID(), f.copy, user("READER"), f.branch, 1L);
        List<Integer> results = raceHttp(f.staff, a, b);
        assertThat(results).containsExactlyInAnyOrder(201, 409);
        assertThat(count("loans", "copy_id", f.copy)).isOne();
        assertThat(copyStatus(f.copy)).isEqualTo("ON_LOAN");
    }

    @Test void sameReaderAcrossDifferentBooksCannotExceedQuota() throws Exception {
        var a = fixture(); var b = fixture();
        List<Integer> results = raceHttp(a.staff, a.borrow(), new BorrowRequest(UUID.randomUUID(), b.copy, a.reader, b.branch, 1L));
        assertThat(results).containsExactlyInAnyOrder(201, 409);
        assertThat(count("loans", "reader_id", a.reader)).isOne();
    }

    @Test void concurrentRetryHasTwoSuccessfulResponsesButOnlyOneLoanAndEvent() throws Exception {
        var f = fixture(); var request = f.borrow();
        assertThat(raceHttp(f.staff, request, request)).containsExactly(201, 201);
        assertThat(count("loans", "copy_id", f.copy)).isOne();
        assertThat(count("circulation_requests", "request_id", request.requestId())).isOne();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM outbox_events WHERE payload->'data'->>'copyId'=?",
                Integer.class, f.copy.toString())).isOne();
    }

    @Test void borrowReallyWaitsForCopyLockAndRechecksTheCommittedVersion() {
        var f = fixture(); var request = f.borrow();
        try (var pool = Executors.newSingleThreadExecutor()) {
            var future = new TransactionTemplate(transactions).execute(s -> {
                int holder = jdbc.queryForObject("SELECT pg_backend_pid()", Integer.class);
                jdbc.queryForList("SELECT id FROM book_copies WHERE id=? FOR UPDATE", f.copy);
                var pending = pool.submit(() -> commands.borrow(f.staff, request));
                long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(4);
                boolean blocked = false;
                while (System.nanoTime() < deadline && !blocked) {
                    // pg_stat_activity giữ snapshot trong transaction; lấy lại để thấy connection vừa tới.
                    jdbc.queryForList("SELECT pg_stat_clear_snapshot()");
                    blocked = Boolean.TRUE.equals(jdbc.queryForObject("""
                            SELECT EXISTS(SELECT 1 FROM pg_stat_activity
                            WHERE ?=ANY(pg_blocking_pids(pid)) AND query LIKE '%FOR UPDATE OF c%')
                            """, Boolean.class, holder));
                    Thread.yield();
                }
                assertThat(blocked).as("Borrow chờ khóa Copy tại PostgreSQL").isTrue();
                jdbc.update("UPDATE book_copies SET barcode=?,version=version+1 WHERE id=?", UUID.randomUUID().toString(), f.copy);
                return pending;
            });
            assertThatThrownBy(() -> future.get(10, TimeUnit.SECONDS)).hasCauseInstanceOf(AuthFailure.class)
                    .satisfies(e -> assertThat(((AuthFailure) e.getCause()).status()).isEqualTo(409));
        }
        assertThat(count("loans", "copy_id", f.copy)).isZero();
        assertThat(copyStatus(f.copy)).isEqualTo("AVAILABLE");
    }

    @Test void staffCanBorrowForEachOtherWithoutForeignKeyLockDeadlock() throws Exception {
        var a = fixture(); var b = fixture(); var locked = new CountDownLatch(2);
        try (var pool = Executors.newFixedThreadPool(2)) {
            var first = pool.submit(() -> new TransactionTemplate(transactions).execute(s -> {
                lockReaderAndAwait(b.staff, locked);
                return commands.borrow(a.staff, new BorrowRequest(UUID.randomUUID(), a.copy, b.staff, a.branch, 1L));
            }));
            var second = pool.submit(() -> new TransactionTemplate(transactions).execute(s -> {
                lockReaderAndAwait(a.staff, locked);
                return commands.borrow(b.staff, new BorrowRequest(UUID.randomUUID(), b.copy, a.staff, b.branch, 1L));
            }));
            assertThat(first.get(15, TimeUnit.SECONDS).readerId()).isEqualTo(b.staff);
            assertThat(second.get(15, TimeUnit.SECONDS).readerId()).isEqualTo(a.staff);
        }
    }

    private void lockReaderAndAwait(UUID reader, CountDownLatch locked) {
        jdbc.queryForList("SELECT id FROM users WHERE id=? FOR NO KEY UPDATE", reader);
        locked.countDown();
        try { assertThat(locked.await(5, TimeUnit.SECONDS)).isTrue(); }
        catch (InterruptedException error) { Thread.currentThread().interrupt(); throw new IllegalStateException(error); }
    }

    @Test void returnAndStateHttpBoundariesRequireStaffAndRejectInvalidVersions() throws Exception {
        var f = fixture(); var loan = commands.borrow(f.staff, f.borrow());
        var staff = jwt().jwt(j -> j.subject(f.staff.toString())).authorities(new SimpleGrantedAuthority("ROLE_LIBRARIAN"));
        var reader = jwt().jwt(j -> j.subject(f.reader.toString())).authorities(new SimpleGrantedAuthority("ROLE_READER"));
        String path = "/api/v1/loans/" + loan.loanId() + "/return";
        String payload = json.writeValueAsString(new ReturnRequest(UUID.randomUUID(), f.branch, 0L));
        mvc.perform(post(path).contentType("application/json").content(payload)).andExpect(status().isUnauthorized());
        mvc.perform(post(path).with(reader).contentType("application/json").content(payload)).andExpect(status().isForbidden());
        mvc.perform(post(path).with(staff).contentType("application/json").content(payload.replace("\"version\":0", "\"version\":0.5")))
                .andExpect(status().isBadRequest());
        mvc.perform(post(path).with(staff).contentType("application/json").content(payload)).andExpect(status().isOk());
        String statePath = "/api/v1/copies/" + f.copy + "/state";
        String state = json.writeValueAsString(Map.of("requestId", UUID.randomUUID(), "version", 3, "status", "DAMAGED", "reason", "Rách trang"));
        mvc.perform(post(statePath).with(reader).contentType("application/json").content(state)).andExpect(status().isForbidden());
        mvc.perform(post(statePath).with(staff).contentType("application/json").content(state.replace("Rách trang", " ")))
                .andExpect(status().isUnprocessableEntity());
        mvc.perform(post(statePath).with(staff).contentType("application/json").content(state)).andExpect(status().isOk());
    }

    private List<Integer> raceHttp(UUID actor, BorrowRequest a, BorrowRequest b) throws Exception {
        var ready = new CountDownLatch(2); var start = new CountDownLatch(1);
        try (var pool = Executors.newFixedThreadPool(2)) {
            var tasks = List.of(a, b).stream().map(request -> pool.submit(() -> {
                ready.countDown(); assertThat(start.await(10, TimeUnit.SECONDS)).isTrue();
                return mvc.perform(post("/api/v1/loans").with(jwt().jwt(j -> j.subject(actor.toString()))
                        .authorities(new SimpleGrantedAuthority("ROLE_LIBRARIAN")))
                        .contentType("application/json").content(json.writeValueAsString(request)))
                        .andReturn().getResponse().getStatus();
            })).toList();
            assertThat(ready.await(10, TimeUnit.SECONDS)).isTrue(); start.countDown();
            return List.of(tasks.get(0).get(15, TimeUnit.SECONDS), tasks.get(1).get(15, TimeUnit.SECONDS));
        } finally { start.countDown(); }
    }

    private Fixture fixture() {
        UUID staff = user("LIBRARIAN"), reader = user("READER"), book = UUID.randomUUID(), edition = UUID.randomUUID();
        UUID branch = UUID.randomUUID(), shelf = UUID.randomUUID();
        jdbc.update("INSERT INTO books(id,title,normalized_title) VALUES (?,'Sách thử giao dịch','sach thu giao dich')", book);
        jdbc.update("INSERT INTO editions(id,book_id) VALUES (?,?)", edition, book);
        jdbc.update("INSERT INTO branches(id,code,name) VALUES (?,?,'Chi nhánh thử')", branch, branch.toString().substring(0, 20));
        jdbc.update("INSERT INTO shelves(id,branch_id,code,label) VALUES (?,?,'S1','Kệ thử')", shelf, branch);
        UUID copy = copy(edition, shelf);
        states.change(staff, copy, UUID.randomUUID(), 0, "AVAILABLE", "Đã nhập kho và định vị");
        return new Fixture(staff, reader, book, edition, branch, shelf, copy);
    }

    private UUID copy(UUID edition, UUID shelf) {
        UUID copy = UUID.randomUUID();
        jdbc.update("INSERT INTO book_copies(id,edition_id,barcode,shelf_id) VALUES (?,?,?,?)", copy, edition, copy.toString(), shelf);
        return copy;
    }
    private UUID user(String role) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO users(id,member_code,email,email_normalized,full_name,password_hash,status,created_at,updated_at)
                VALUES (?,?,?,?,'Giao dịch thử','test-only','ACTIVE',now(),now())
                """, id, id.toString().substring(0, 20), id + "@test.local", id + "@test.local");
        jdbc.update("INSERT INTO user_roles VALUES (?,?)", id, role); return id;
    }
    private String copyStatus(UUID copy) { return jdbc.queryForObject("SELECT status FROM book_copies WHERE id=?", String.class, copy); }
    private int count(String table, String column, UUID value) {
        return jdbc.queryForObject("SELECT count(*) FROM " + table + " WHERE " + column + "=?", Integer.class, value);
    }
    private static void failure(int status, Runnable action) {
        assertThatThrownBy(action::run).isInstanceOfSatisfying(AuthFailure.class, e -> assertThat(e.status()).isEqualTo(status));
    }
}
