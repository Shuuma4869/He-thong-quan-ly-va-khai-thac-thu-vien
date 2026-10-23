package io.github.shuuma4869.lams.core.circulation.loan.infrastructure;

import io.github.shuuma4869.lams.core.circulation.loan.domain.Loan;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Repository
public class LoanRepository {
    private final JdbcTemplate jdbc;
    public LoanRepository(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    @Transactional(propagation = Propagation.MANDATORY)
    public void insert(Loan loan) {
        jdbc.update("""
                INSERT INTO loans(id,copy_id,edition_id,reader_id,branch_id,borrowed_by,borrowed_at,due_at,
                    policy_version,policy_snapshot)
                VALUES (?,?,?,?,?,?,?,?,?,?::jsonb)
                """, loan.id(), loan.copyId(), loan.editionId(), loan.readerId(), loan.branchId(),
                loan.borrowedBy(), Timestamp.from(loan.borrowedAt()), Timestamp.from(loan.dueAt()),
                loan.policyVersion(), loan.policySnapshot());
    }

    public Optional<Loan> find(UUID id) {
        return jdbc.query("SELECT * FROM loans WHERE id=?", (rs, row) -> map(rs), id).stream().findFirst();
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public Optional<Loan> lock(UUID id) {
        return jdbc.query("SELECT * FROM loans WHERE id=? FOR UPDATE", (rs, row) -> map(rs), id)
                .stream().findFirst();
    }

    public long activeCount(UUID reader) {
        return jdbc.queryForObject("SELECT count(*) FROM loans WHERE reader_id=? AND returned_at IS NULL",
                Long.class, reader);
    }

    public boolean hasOverdue(UUID reader, Instant now) {
        return Boolean.TRUE.equals(jdbc.queryForObject("""
                SELECT EXISTS(SELECT 1 FROM loans WHERE reader_id=? AND returned_at IS NULL AND due_at<?)
                """, Boolean.class, reader, Timestamp.from(now)));
    }

    private static Loan map(ResultSet rs) throws SQLException {
        Timestamp returned = rs.getTimestamp("returned_at");
        return new Loan(rs.getObject("id", UUID.class), rs.getObject("copy_id", UUID.class),
                rs.getObject("edition_id", UUID.class), rs.getObject("reader_id", UUID.class),
                rs.getObject("branch_id", UUID.class), rs.getObject("borrowed_by", UUID.class),
                rs.getTimestamp("borrowed_at").toInstant(), rs.getTimestamp("due_at").toInstant(),
                returned == null ? null : returned.toInstant(), rs.getObject("returned_by", UUID.class),
                rs.getInt("renewal_count"), rs.getLong("version"), rs.getString("policy_version"),
                rs.getString("policy_snapshot"));
    }
}
