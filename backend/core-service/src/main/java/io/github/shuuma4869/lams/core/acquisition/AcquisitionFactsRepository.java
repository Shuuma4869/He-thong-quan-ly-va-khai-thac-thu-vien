package io.github.shuuma4869.lams.core.acquisition;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class AcquisitionFactsRepository {
    public record Copies(long owned, long available) {}

    private final JdbcTemplate jdbc;
    public AcquisitionFactsRepository(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public boolean bookExists(UUID id) {
        return Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM books WHERE id=?)",
                Boolean.class, id));
    }

    public boolean branchExists(UUID id) {
        return Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM branches WHERE id=?)",
                Boolean.class, id));
    }

    public Copies copies(UUID bookId, UUID branchId) {
        return jdbc.queryForObject("""
                SELECT count(*) AS owned, count(*) FILTER (WHERE c.status='AVAILABLE') AS available
                FROM book_copies c JOIN editions e ON e.id=c.edition_id
                JOIN shelves s ON s.id=c.shelf_id
                WHERE e.book_id=? AND s.branch_id=?
                """, (rs, row) -> new Copies(rs.getLong("owned"), rs.getLong("available")), bookId, branchId);
    }

    public long waitingHolds(UUID bookId, UUID branchId) {
        return jdbc.queryForObject("""
                SELECT count(*) FROM holds WHERE book_id=? AND branch_id=? AND status='WAITING'
                """, Long.class, bookId, branchId);
    }

    public long loansStarted(UUID bookId, UUID branchId, Instant from, Instant to) {
        return jdbc.queryForObject("""
                SELECT count(*) FROM loans l JOIN editions e ON e.id=l.edition_id
                WHERE e.book_id=? AND l.branch_id=? AND l.borrowed_at>=? AND l.borrowed_at<?
                """, Long.class, bookId, branchId, Timestamp.from(from), Timestamp.from(to));
    }
}
