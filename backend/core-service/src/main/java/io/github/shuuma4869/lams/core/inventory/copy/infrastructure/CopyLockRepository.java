package io.github.shuuma4869.lams.core.inventory.copy.infrastructure;

import io.github.shuuma4869.lams.core.identity.application.AuthFailure;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Repository
public class CopyLockRepository {
    public record LockedCopy(UUID id, UUID editionId, UUID bookId, UUID branchId,
                             String branchStatus, String status, long version) {}
    private final JdbcTemplate jdbc;
    public CopyLockRepository(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    @Transactional(propagation = Propagation.MANDATORY)
    public LockedCopy lock(UUID id) {
        var books = jdbc.query("SELECT e.book_id FROM book_copies c JOIN editions e ON e.id=c.edition_id WHERE c.id=?",
                (rs, row) -> rs.getObject(1, UUID.class), id);
        if (books.isEmpty()) throw new AuthFailure(404, "Không tìm thấy bản sách.");
        UUID book = books.getFirst();
        lockBook(book);
        var rows = jdbc.query("""
                SELECT c.id,c.edition_id,e.book_id,s.branch_id,b.status AS branch_status,c.status,c.version
                FROM book_copies c JOIN editions e ON e.id=c.edition_id
                JOIN shelves s ON s.id=c.shelf_id JOIN branches b ON b.id=s.branch_id
                WHERE c.id=? FOR UPDATE OF c
                """, (rs, row) -> new LockedCopy(rs.getObject("id", UUID.class), rs.getObject("edition_id", UUID.class),
                    rs.getObject("book_id", UUID.class), rs.getObject("branch_id", UUID.class),
                    rs.getString("branch_status"), rs.getString("status"), rs.getLong("version")), id);
        if (rows.isEmpty()) throw new AuthFailure(404, "Không tìm thấy bản sách.");
        var copy = rows.getFirst();
        if (!copy.bookId().equals(book)) throw new AuthFailure(409, "Ấn bản đã thay đổi; hãy tải lại bản sách.");
        return copy;
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void lockBook(UUID book) {
        jdbc.queryForList("SELECT pg_advisory_xact_lock(hashtextextended(?,0))", "circulation-book:" + book);
    }
}
