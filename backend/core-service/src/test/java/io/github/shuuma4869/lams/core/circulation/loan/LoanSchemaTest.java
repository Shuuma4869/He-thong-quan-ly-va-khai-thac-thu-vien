package io.github.shuuma4869.lams.core.circulation.loan;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import io.github.shuuma4869.lams.core.circulation.loan.domain.Loan;
import io.github.shuuma4869.lams.core.circulation.loan.infrastructure.LoanRepository;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@Testcontainers
class LoanSchemaTest {
    @Container static final PostgreSQLContainer<?> DB = new PostgreSQLContainer<>("postgres:17.6-alpine");
    private static final Instant NOW = Instant.parse("2026-10-24T00:00:00Z");
    private record Fixture(String schema, JdbcTemplate jdbc, LoanRepository loans, TransactionTemplate tx,
                           UUID reader, UUID staff, UUID book, UUID edition, UUID branch, UUID copy) {
        Loan loan() {
            return new Loan(UUID.randomUUID(), copy, edition, reader, branch, staff, NOW, NOW.plusSeconds(86400),
                    null, null, 0, 0, "test-v1", "{\"loanDuration\":\"P1D\"}");
        }
        void insert(Loan loan) { tx.executeWithoutResult(s -> loans.insert(loan)); }
    }

    private static void migrate(String schema, String target) {
        Flyway.configure().dataSource(DB.getJdbcUrl(), DB.getUsername(), DB.getPassword())
                .schemas(schema).defaultSchema(schema).target(target).load().migrate();
    }

    private Fixture fixture(boolean upgrade) {
        String schema = "loan_" + UUID.randomUUID().toString().replace("-", "");
        migrate(schema, upgrade ? "15" : "16");
        var source = new DriverManagerDataSource(DB.getJdbcUrl() + "&currentSchema=" + schema,
                DB.getUsername(), DB.getPassword());
        var jdbc = new JdbcTemplate(source);
        UUID reader = UUID.randomUUID(), staff = UUID.randomUUID(), book = UUID.randomUUID();
        UUID edition = UUID.randomUUID(), branch = UUID.randomUUID(), shelf = UUID.randomUUID(), copy = UUID.randomUUID();
        for (UUID user : new UUID[]{reader, staff}) {
            jdbc.update("""
                    INSERT INTO users(id,member_code,email,email_normalized,full_name,password_hash,status,created_at,updated_at)
                    VALUES (?,?,?,?,'Loan test','test-only','ACTIVE',now(),now())
                    """, user, user.toString().substring(0,20), user + "@test.local", user + "@test.local");
        }
        jdbc.update("INSERT INTO user_roles VALUES (?,'READER'),(?,'LIBRARIAN')", reader, staff);
        jdbc.update("INSERT INTO books(id,title,normalized_title) VALUES (?,'Existing book','existing book')", book);
        jdbc.update("INSERT INTO editions(id,book_id) VALUES (?,?)", edition, book);
        jdbc.update("INSERT INTO branches(id,code,name) VALUES (?,'B1','Branch')", branch);
        jdbc.update("INSERT INTO shelves(id,branch_id,code,label) VALUES (?,?,'S1','Shelf')", shelf, branch);
        jdbc.update("INSERT INTO book_copies(id,edition_id,barcode,shelf_id) VALUES (?,?,'COPY-1',?)", copy, edition, shelf);
        jdbc.update("INSERT INTO favorites(user_id,book_id) VALUES (?,?)", reader, book);
        jdbc.update("INSERT INTO reviews(id,user_id,book_id,body,rating) VALUES (?,?,?,'Existing review',5)",
                UUID.randomUUID(), reader, book);
        if (upgrade) migrate(schema, "16");
        return new Fixture(schema, jdbc, new LoanRepository(jdbc),
                new TransactionTemplate(new DataSourceTransactionManager(source)), reader, staff, book, edition, branch, copy);
    }

    @Test void freshDatabaseHasLoanSchemaAndRequiredIndexes() {
        var f = fixture(false);
        assertThat(f.jdbc.queryForObject("SELECT max(version::integer) FROM flyway_schema_history WHERE success", Integer.class)).isEqualTo(16);
        assertThat(f.jdbc.queryForObject("SELECT count(*) FROM pg_indexes WHERE schemaname=? AND tablename='loans'",
                Integer.class, f.schema)).isEqualTo(6);
        assertThat(f.loans.activeCount(f.reader)).isZero();
    }

    @Test void upgradeFromV15PreservesIdentityCatalogInventoryAndContributions() {
        var f = fixture(true);
        assertThat(f.jdbc.queryForObject("SELECT count(*) FROM users", Integer.class)).isEqualTo(2);
        assertThat(f.jdbc.queryForObject("SELECT count(*) FROM user_roles", Integer.class)).isEqualTo(2);
        assertThat(f.jdbc.queryForObject("SELECT status FROM book_copies WHERE id=?", String.class, f.copy)).isEqualTo("IN_PROCESS");
        assertThat(f.jdbc.queryForObject("SELECT title FROM books WHERE id=?", String.class, f.book)).isEqualTo("Existing book");
        assertThat(f.jdbc.queryForObject("SELECT count(*) FROM favorites", Integer.class)).isOne();
        assertThat(f.jdbc.queryForObject("SELECT body FROM reviews", String.class)).isEqualTo("Existing review");
        assertThat(f.jdbc.queryForObject("SELECT count(*) FROM loans", Integer.class)).isZero();
        migrate(f.schema, "16");
        assertThat(f.jdbc.queryForObject("SELECT count(*) FROM flyway_schema_history WHERE version='16'", Integer.class)).isOne();
    }

    @Test void activeCopyIsUniqueButReturnedLoanDoesNotPreventLaterBorrow() {
        var f = fixture(false); var first = f.loan(); f.insert(first);
        assertThatThrownBy(() -> f.insert(f.loan())).isInstanceOf(DataIntegrityViolationException.class);
        f.jdbc.update("UPDATE loans SET returned_at=?,returned_by=? WHERE id=?", Timestamp.from(NOW.plusSeconds(60)), f.staff, first.id());
        f.insert(f.loan());
        assertThat(f.jdbc.queryForObject("SELECT count(*) FROM loans", Integer.class)).isEqualTo(2);
        assertThat(f.loans.activeCount(f.reader)).isOne();
        assertThat(f.loans.find(first.id()).orElseThrow().active()).isFalse();
    }

    @Test void upgradeV17PreservesLoanAndAddsConstrainedCommandAuditTables() {
        var f = fixture(false); var loan = f.loan(); f.insert(loan);
        migrate(f.schema, "17");
        assertThat(f.loans.find(loan.id()).orElseThrow()).usingRecursiveComparison()
                .ignoringFields("policySnapshot").isEqualTo(loan);
        assertThat(f.jdbc.queryForObject("SELECT policy_snapshot->>'loanDuration' FROM loans WHERE id=?",
                String.class, loan.id())).isEqualTo("P1D");
        assertThat(f.jdbc.queryForObject("SELECT count(*) FROM circulation_requests", Integer.class)).isZero();
        assertThat(f.jdbc.queryForObject("SELECT count(*) FROM copy_state_changes", Integer.class)).isZero();
        UUID key = UUID.randomUUID();
        f.jdbc.update("INSERT INTO circulation_requests(actor_id,request_id,command,request_payload,response_payload) VALUES (?,?,'BORROW','{}','{}')",
                f.staff, key);
        assertThatThrownBy(() -> f.jdbc.update("INSERT INTO circulation_requests(actor_id,request_id,command,request_payload,response_payload) VALUES (?,?,'RETURN','{}','{}')",
                f.staff, key)).isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> f.jdbc.update("""
                INSERT INTO copy_state_changes(id,copy_id,from_status,to_status,copy_version,actor_kind,reason,occurred_at)
                VALUES (?,?,'AVAILABLE','ON_LOAN',1,'HUMAN','Thiếu nhân viên',now())
                """, UUID.randomUUID(), f.copy)).isInstanceOf(DataIntegrityViolationException.class);
        migrate(f.schema, "17");
        assertThat(f.jdbc.queryForObject("SELECT count(*) FROM flyway_schema_history WHERE version='17'", Integer.class)).isOne();
    }

    @Test void foreignKeysPreventOrphansAndDeletionOfHistoricalReferences() {
        var f = fixture(false); var loan = f.loan(); f.insert(loan);
        for (String column : new String[]{"copy_id", "edition_id", "reader_id", "branch_id", "borrowed_by"}) {
            assertThatThrownBy(() -> f.jdbc.update("UPDATE loans SET " + column + "=? WHERE id=?", UUID.randomUUID(), loan.id()))
                    .as(column).isInstanceOf(DataIntegrityViolationException.class).satisfies(error ->
                            assertThat(((java.sql.SQLException) ((DataIntegrityViolationException) error).getMostSpecificCause())
                                    .getSQLState()).isEqualTo("23503"));
        }
        f.jdbc.update("UPDATE loans SET returned_at=?,returned_by=? WHERE id=?", Timestamp.from(NOW), f.staff, loan.id());
        assertThatThrownBy(() -> f.jdbc.update("UPDATE loans SET returned_by=? WHERE id=?", UUID.randomUUID(), loan.id()))
                .isInstanceOf(DataIntegrityViolationException.class).satisfies(error ->
                        assertThat(((java.sql.SQLException) ((DataIntegrityViolationException) error).getMostSpecificCause())
                                .getSQLState()).isEqualTo("23503"));
        assertThatThrownBy(() -> f.jdbc.update("DELETE FROM book_copies WHERE id=?", f.copy)).isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> f.jdbc.update("DELETE FROM users WHERE id=?", f.staff)).isInstanceOf(DataIntegrityViolationException.class);
        assertThat(f.loans.find(loan.id())).isPresent();
    }

    @Test void copyMaintenanceAfterReturnDoesNotRewriteHistoricalEditionOrBranch() {
        var f = fixture(false); var loan = f.loan(); f.insert(loan);
        f.jdbc.update("UPDATE loans SET returned_at=?,returned_by=? WHERE id=?", Timestamp.from(NOW), f.staff, loan.id());
        UUID edition = UUID.randomUUID(), branch = UUID.randomUUID(), shelf = UUID.randomUUID();
        f.jdbc.update("INSERT INTO editions(id,book_id) VALUES (?,?)", edition, f.book);
        f.jdbc.update("INSERT INTO branches(id,code,name) VALUES (?,'B2','New branch')", branch);
        f.jdbc.update("INSERT INTO shelves(id,branch_id,code,label) VALUES (?,?,'S2','New shelf')", shelf, branch);
        f.jdbc.update("UPDATE book_copies SET edition_id=?,shelf_id=? WHERE id=?", edition, shelf, f.copy);
        var historical = f.loans.find(loan.id()).orElseThrow();
        assertThat(historical.editionId()).isEqualTo(f.edition);
        assertThat(historical.branchId()).isEqualTo(f.branch);
    }

    @Test void temporalReturnPolicyAndCounterConstraintsRejectInvalidRows() {
        var f = fixture(false); var loan = f.loan(); f.insert(loan);
        for (String assignment : new String[]{"due_at=borrowed_at", "due_at=borrowed_at-interval '1 second'",
                "returned_at=borrowed_at", "returned_by=borrowed_by", "renewal_count=-1", "version=-1",
                "policy_version=' '", "policy_snapshot='[]'::jsonb", "policy_snapshot='null'::jsonb",
                "returned_at=borrowed_at-interval '1 second',returned_by=borrowed_by"}) {
            assertThatThrownBy(() -> f.jdbc.update("UPDATE loans SET " + assignment + " WHERE id=?", loan.id()))
                    .as(assignment).isInstanceOf(DataIntegrityViolationException.class);
        }
        assertThat(f.loans.find(loan.id()).orElseThrow()).usingRecursiveComparison()
                .ignoringFields("policySnapshot").isEqualTo(loan);
    }

    @Test void repositoryMapsTimeSnapshotAndOverdueBoundaryWithoutMixingOwners() {
        var f = fixture(false); var loan = f.loan(); f.insert(loan);
        var read = f.loans.find(loan.id()).orElseThrow();
        assertThat(read.id()).isEqualTo(loan.id());
        assertThat(read.editionId()).isEqualTo(f.edition);
        assertThat(read.branchId()).isEqualTo(f.branch);
        assertThat(read.policySnapshot()).contains("P1D");
        assertThat(read.overdueAt(loan.dueAt())).isFalse();
        assertThat(f.loans.hasOverdue(f.reader, loan.dueAt())).isFalse();
        assertThat(f.loans.hasOverdue(f.reader, loan.dueAt().plusSeconds(1))).isTrue();
        assertThat(f.loans.hasOverdue(f.staff, loan.dueAt().plusSeconds(1))).isFalse();
        assertThat(f.loans.activeCount(f.staff)).isZero();
        assertThat(f.loans.find(UUID.randomUUID())).isEmpty();
        var locked = f.tx.execute(s -> f.loans.lock(loan.id()));
        assertThat(locked).isPresent();
    }

    @Test void transactionRollbackDoesNotLeaveLoanBehind() {
        var f = fixture(false); var loan = f.loan();
        f.tx.executeWithoutResult(s -> { f.loans.insert(loan); s.setRollbackOnly(); });
        assertThat(f.loans.find(loan.id())).isEmpty();
        assertThat(f.loans.activeCount(f.reader)).isZero();
    }

    @Test void concurrentInsertsCannotCreateTwoActiveLoansForOneCopy() throws Exception {
        var f = fixture(false);
        var ready = new CountDownLatch(2); var release = new CountDownLatch(1);
        try (var pool = Executors.newFixedThreadPool(2)) {
            java.util.concurrent.Callable<Boolean> insert = () -> {
                try {
                    f.tx.executeWithoutResult(s -> {
                        f.jdbc.execute("SET LOCAL lock_timeout='5s'");
                        ready.countDown();
                        try { if (!release.await(5, TimeUnit.SECONDS)) throw new IllegalStateException("Thiếu điểm đồng bộ"); }
                        catch (InterruptedException error) { Thread.currentThread().interrupt(); throw new IllegalStateException(error); }
                        f.loans.insert(f.loan());
                    });
                    return true;
                } catch (DataIntegrityViolationException duplicate) {
                    assertThat(duplicate.getMostSpecificCause()).isInstanceOf(java.sql.SQLException.class);
                    assertThat(((java.sql.SQLException) duplicate.getMostSpecificCause()).getSQLState()).isEqualTo("23505");
                    return false;
                }
            };
            var first = pool.submit(insert); var second = pool.submit(insert);
            try { assertThat(ready.await(5, TimeUnit.SECONDS)).isTrue(); } finally { release.countDown(); }
            assertThat(java.util.List.of(first.get(10, TimeUnit.SECONDS), second.get(10, TimeUnit.SECONDS)))
                    .containsExactlyInAnyOrder(true, false);
        }
        assertThat(f.loans.activeCount(f.reader)).isOne();
    }
}
