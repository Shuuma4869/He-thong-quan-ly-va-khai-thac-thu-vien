package io.github.shuuma4869.lams.core.hold.infrastructure;

import io.github.shuuma4869.lams.core.hold.domain.Hold;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class HoldRepository {
    private final JdbcTemplate jdbc;
    public HoldRepository(JdbcTemplate jdbc) { this.jdbc = jdbc; }
    public Optional<Hold> find(UUID id) { return jdbc.query("SELECT * FROM holds WHERE id=?", (r,n) -> map(r), id).stream().findFirst(); }
    public Optional<Hold> assigned(UUID copy) {
        return jdbc.query("SELECT * FROM holds WHERE copy_id=? AND status='READY'", (r,n) -> map(r), copy).stream().findFirst();
    }
    public List<Hold> waiting(UUID book, UUID branch, UUID edition) {
        return jdbc.query("""
                SELECT * FROM holds WHERE book_id=? AND branch_id=? AND status='WAITING'
                    AND (edition_id IS NULL OR edition_id=?) ORDER BY queued_at,id
                """, (r,n) -> map(r), book, branch, edition);
    }
    public List<Hold> mine(UUID reader, int page, int size) {
        return jdbc.query("SELECT * FROM holds WHERE reader_id=? ORDER BY queued_at DESC,id LIMIT ? OFFSET ?",
                (r,n) -> map(r), reader, size, (long)page * size);
    }
    public long countMine(UUID reader) { return jdbc.queryForObject("SELECT count(*) FROM holds WHERE reader_id=?", Long.class, reader); }
    private static Instant instant(ResultSet rs, String column) throws SQLException {
        Timestamp value = rs.getTimestamp(column); return value == null ? null : value.toInstant();
    }
    public static Hold map(ResultSet r) throws SQLException {
        return new Hold(r.getObject("id",UUID.class), r.getObject("reader_id",UUID.class), r.getObject("book_id",UUID.class),
                r.getObject("edition_id",UUID.class), r.getObject("branch_id",UUID.class), r.getString("status"),
                instant(r,"queued_at"), instant(r,"ready_at"), instant(r,"expires_at"), instant(r,"closed_at"),
                r.getObject("copy_id",UUID.class), r.getObject("loan_id",UUID.class), r.getLong("version"),
                r.getString("policy_version"), r.getLong("pickup_seconds"));
    }
}
