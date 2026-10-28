package io.github.shuuma4869.lams.core.catalog.publicapi;

import io.github.shuuma4869.lams.core.identity.application.AuthFailure;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PublicAvailabilityService {
    public record BranchAvailability(UUID editionId, UUID branchId, String branchCode, String branchName,
                                     long catalogedCopies, long availableCopies, long waitingHolds) {}
    public record Availability(UUID bookId, Instant checkedAt, List<BranchAvailability> branches) {}
    private final JdbcTemplate jdbc;

    public PublicAvailabilityService(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public Availability forBook(UUID bookId) {
        if (jdbc.queryForObject("SELECT count(*) FROM books WHERE id=?", Long.class, bookId) == 0)
            throw new AuthFailure(404, "Không tìm thấy sách.");
        Instant checkedAt = jdbc.queryForObject("SELECT transaction_timestamp()", Timestamp.class).toInstant();
        List<BranchAvailability> rows = jdbc.query("""
                SELECT e.id AS edition_id,b.id AS branch_id,b.code AS branch_code,b.name AS branch_name,
                  count(c.id) AS cataloged_copies,
                  count(c.id) FILTER (WHERE c.status='AVAILABLE'
                    AND NOT EXISTS (SELECT 1 FROM loans l WHERE l.copy_id=c.id AND l.returned_at IS NULL)
                    AND NOT EXISTS (SELECT 1 FROM holds h WHERE h.copy_id=c.id AND h.status='READY')) AS available_copies,
                  (SELECT count(*) FROM holds h WHERE h.book_id=e.book_id AND h.branch_id=b.id
                    AND h.status='WAITING' AND (h.edition_id IS NULL OR h.edition_id=e.id)) AS waiting_holds
                FROM editions e
                JOIN book_copies c ON c.edition_id=e.id
                JOIN shelves s ON s.id=c.shelf_id
                JOIN branches b ON b.id=s.branch_id AND b.status='ACTIVE'
                WHERE e.book_id=?
                GROUP BY e.id,b.id,b.code,b.name
                ORDER BY e.id,b.code,b.id
                LIMIT 201
                """, (rs, row) -> new BranchAvailability(rs.getObject("edition_id", UUID.class),
                rs.getObject("branch_id", UUID.class), rs.getString("branch_code"), rs.getString("branch_name"),
                rs.getLong("cataloged_copies"), rs.getLong("available_copies"), rs.getLong("waiting_holds")), bookId);
        if (rows.size() > 200) throw new AuthFailure(422, "Có quá nhiều chi nhánh hoặc ấn bản để hiển thị cùng lúc.");
        return new Availability(bookId, checkedAt, rows);
    }
}
