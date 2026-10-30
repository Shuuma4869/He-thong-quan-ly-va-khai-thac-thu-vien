package io.github.shuuma4869.lams.core.catalog.publicapi;

import io.github.shuuma4869.lams.core.identity.application.AuthFailure;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PublicAvailabilityService {
    public record CopyCounts(long totalCopies, long availableCopies, long borrowedCopies, long reservedCopies,
                             long unavailableCopies, long withdrawnCopies) {
        private CopyCounts plus(CopyCounts other) {
            return new CopyCounts(totalCopies + other.totalCopies, availableCopies + other.availableCopies,
                    borrowedCopies + other.borrowedCopies, reservedCopies + other.reservedCopies,
                    unavailableCopies + other.unavailableCopies, withdrawnCopies + other.withdrawnCopies);
        }
    }

    public record BranchAvailability(UUID branchId, String branchCode, String branchName, CopyCounts copies,
                                     long compatibleWaitingHolds, long readyHolds) {}
    public record EditionAvailability(UUID editionId, CopyCounts copies, long compatibleWaitingHolds,
                                      long readyHolds, List<BranchAvailability> branches) {}
    public record BranchSummary(UUID branchId, String branchCode, String branchName, CopyCounts copies,
                                long waitingHolds, long readyHolds) {}
    public record Availability(UUID bookId, Instant checkedAt, CopyCounts copies, long waitingHolds,
                               long readyHolds, List<BranchSummary> branches, List<EditionAvailability> editions) {}
    public record CatalogBranchAvailability(UUID branchId, String branchCode, String branchName, CopyCounts copies) {}
    public record CatalogAvailability(UUID bookId, CopyCounts copies, List<CatalogBranchAvailability> branches) {}

    private record AvailabilityRow(UUID editionId, UUID branchId, String branchCode, String branchName,
                                   CopyCounts copies, long branchWaitingHolds, long branchReadyHolds,
                                   long compatibleWaitingHolds, long editionReadyHolds) {}
    private static final CopyCounts ZERO = new CopyCounts(0, 0, 0, 0, 0, 0);

    private final JdbcTemplate jdbc;

    public PublicAvailabilityService(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public Availability forBook(UUID bookId) {
        if (jdbc.queryForObject("SELECT count(*) FROM books WHERE id=?", Long.class, bookId) == 0)
            throw new AuthFailure(404, "Không tìm thấy sách.");

        Instant checkedAt = jdbc.queryForObject("SELECT transaction_timestamp()", Timestamp.class).toInstant();
        CopyCounts bookCopies = jdbc.queryForObject("""
                SELECT COUNT(c.id) FILTER (WHERE c.status<>'WITHDRAWN') AS total_copies,
                       COUNT(c.id) FILTER (WHERE c.status='AVAILABLE'
                           AND NOT EXISTS (SELECT 1 FROM loans l WHERE l.copy_id=c.id AND l.returned_at IS NULL)
                           AND NOT EXISTS (SELECT 1 FROM holds h WHERE h.copy_id=c.id AND h.status='READY')) AS available_copies,
                       COUNT(c.id) FILTER (WHERE c.status='ON_LOAN'
                           OR EXISTS (SELECT 1 FROM loans l WHERE l.copy_id=c.id AND l.returned_at IS NULL)) AS borrowed_copies,
                       COUNT(c.id) FILTER (WHERE c.status='ON_HOLD'
                           OR EXISTS (SELECT 1 FROM holds h WHERE h.copy_id=c.id AND h.status='READY')) AS reserved_copies,
                       COUNT(c.id) FILTER (WHERE c.status IN ('IN_PROCESS','DAMAGED','LOST')) AS unavailable_copies,
                       COUNT(c.id) FILTER (WHERE c.status='WITHDRAWN') AS withdrawn_copies
                FROM editions e
                JOIN book_copies c ON c.edition_id=e.id
                JOIN shelves s ON s.id=c.shelf_id
                JOIN branches b ON b.id=s.branch_id AND b.status='ACTIVE'
                WHERE e.book_id=?
                """, (rs, row) -> new CopyCounts(rs.getLong("total_copies"), rs.getLong("available_copies"),
                rs.getLong("borrowed_copies"), rs.getLong("reserved_copies"), rs.getLong("unavailable_copies"),
                rs.getLong("withdrawn_copies")), bookId);
        long bookWaitingHolds = jdbc.queryForObject(
                "SELECT count(*) FROM holds WHERE book_id=? AND status='WAITING'", Long.class, bookId);
        long bookReadyHolds = jdbc.queryForObject(
                "SELECT count(*) FROM holds WHERE book_id=? AND status='READY'", Long.class, bookId);

        List<AvailabilityRow> rows = jdbc.query("""
                WITH active_branches AS (
                    SELECT b.id,b.code,b.name
                    FROM branches b
                    WHERE b.status='ACTIVE' AND (
                        EXISTS (SELECT 1 FROM book_copies c
                                JOIN editions e ON e.id=c.edition_id
                                JOIN shelves s ON s.id=c.shelf_id
                                WHERE e.book_id=? AND s.branch_id=b.id)
                        OR EXISTS (SELECT 1 FROM holds h
                                   WHERE h.book_id=? AND h.branch_id=b.id
                                     AND h.status IN ('WAITING','READY'))
                    )
                ),
                edition_branches AS (
                    SELECT e.id AS edition_id,b.id AS branch_id,b.code AS branch_code,b.name AS branch_name
                    FROM editions e CROSS JOIN active_branches b
                    WHERE e.book_id=?
                ),
                copy_counts AS (
                    SELECT c.edition_id,s.branch_id,
                           COUNT(c.id) FILTER (WHERE c.status<>'WITHDRAWN') AS total_copies,
                           COUNT(c.id) FILTER (WHERE c.status='AVAILABLE'
                               AND NOT EXISTS (SELECT 1 FROM loans l WHERE l.copy_id=c.id AND l.returned_at IS NULL)
                               AND NOT EXISTS (SELECT 1 FROM holds h WHERE h.copy_id=c.id AND h.status='READY')) AS available_copies,
                           COUNT(c.id) FILTER (WHERE c.status='ON_LOAN'
                               OR EXISTS (SELECT 1 FROM loans l WHERE l.copy_id=c.id AND l.returned_at IS NULL)) AS borrowed_copies,
                           COUNT(c.id) FILTER (WHERE c.status='ON_HOLD'
                               OR EXISTS (SELECT 1 FROM holds h WHERE h.copy_id=c.id AND h.status='READY')) AS reserved_copies,
                           COUNT(c.id) FILTER (WHERE c.status IN ('IN_PROCESS','DAMAGED','LOST')) AS unavailable_copies,
                           COUNT(c.id) FILTER (WHERE c.status='WITHDRAWN') AS withdrawn_copies
                    FROM book_copies c
                    JOIN editions e ON e.id=c.edition_id
                    JOIN shelves s ON s.id=c.shelf_id
                    JOIN active_branches b ON b.id=s.branch_id
                    WHERE e.book_id=?
                    GROUP BY c.edition_id,s.branch_id
                ),
                branch_holds AS (
                    SELECT h.branch_id,
                           COUNT(*) FILTER (WHERE h.status='WAITING') AS waiting_holds,
                           COUNT(*) FILTER (WHERE h.status='READY') AS ready_holds
                    FROM holds h
                    JOIN active_branches b ON b.id=h.branch_id
                    WHERE h.book_id=? AND h.status IN ('WAITING','READY')
                    GROUP BY h.branch_id
                ),
                compatible_waiting AS (
                    SELECT e.id AS edition_id,h.branch_id,COUNT(DISTINCT h.id) AS waiting_holds
                    FROM editions e
                    JOIN holds h ON h.book_id=e.book_id AND h.status='WAITING'
                        AND (h.edition_id IS NULL OR h.edition_id=e.id)
                    JOIN active_branches b ON b.id=h.branch_id
                    WHERE e.book_id=?
                    GROUP BY e.id,h.branch_id
                ),
                ready_by_edition AS (
                    SELECT c.edition_id,s.branch_id,COUNT(DISTINCT h.id) AS ready_holds
                    FROM holds h
                    JOIN book_copies c ON c.id=h.copy_id
                    JOIN shelves s ON s.id=c.shelf_id
                    WHERE h.book_id=? AND h.status='READY'
                    GROUP BY c.edition_id,s.branch_id
                )
                SELECT eb.edition_id,eb.branch_id,eb.branch_code,eb.branch_name,
                       COALESCE(cc.total_copies,0) AS total_copies,
                       COALESCE(cc.available_copies,0) AS available_copies,
                       COALESCE(cc.borrowed_copies,0) AS borrowed_copies,
                       COALESCE(cc.reserved_copies,0) AS reserved_copies,
                       COALESCE(cc.unavailable_copies,0) AS unavailable_copies,
                       COALESCE(cc.withdrawn_copies,0) AS withdrawn_copies,
                       COALESCE(bh.waiting_holds,0) AS branch_waiting_holds,
                       COALESCE(bh.ready_holds,0) AS branch_ready_holds,
                       COALESCE(cw.waiting_holds,0) AS compatible_waiting_holds,
                       COALESCE(re.ready_holds,0) AS edition_ready_holds
                FROM edition_branches eb
                LEFT JOIN copy_counts cc ON cc.edition_id=eb.edition_id AND cc.branch_id=eb.branch_id
                LEFT JOIN branch_holds bh ON bh.branch_id=eb.branch_id
                LEFT JOIN compatible_waiting cw ON cw.edition_id=eb.edition_id AND cw.branch_id=eb.branch_id
                LEFT JOIN ready_by_edition re ON re.edition_id=eb.edition_id AND re.branch_id=eb.branch_id
                ORDER BY eb.edition_id,eb.branch_code,eb.branch_id
                LIMIT 201
                """, (rs, row) -> new AvailabilityRow(
                rs.getObject("edition_id", UUID.class), rs.getObject("branch_id", UUID.class),
                rs.getString("branch_code"), rs.getString("branch_name"),
                new CopyCounts(rs.getLong("total_copies"), rs.getLong("available_copies"),
                        rs.getLong("borrowed_copies"), rs.getLong("reserved_copies"),
                        rs.getLong("unavailable_copies"), rs.getLong("withdrawn_copies")),
                rs.getLong("branch_waiting_holds"), rs.getLong("branch_ready_holds"),
                rs.getLong("compatible_waiting_holds"), rs.getLong("edition_ready_holds")),
                bookId, bookId, bookId, bookId, bookId, bookId, bookId);
        if (rows.size() > 200)
            throw new AuthFailure(422, "Có quá nhiều cặp ấn bản và chi nhánh để hiển thị cùng lúc.");

        Map<UUID, List<AvailabilityRow>> byEdition = new LinkedHashMap<>();
        Map<UUID, AvailabilityRow> branchRows = new LinkedHashMap<>();
        rows.forEach(row -> {
            byEdition.computeIfAbsent(row.editionId(), ignored -> new ArrayList<>()).add(row);
            branchRows.putIfAbsent(row.branchId(), row);
        });
        List<EditionAvailability> editions = byEdition.entrySet().stream().map(entry -> {
            CopyCounts counts = ZERO;
            long compatibleWaiting = 0;
            long ready = 0;
            List<BranchAvailability> branches = new ArrayList<>();
            for (AvailabilityRow row : entry.getValue()) {
                counts = counts.plus(row.copies());
                compatibleWaiting += row.compatibleWaitingHolds();
                ready += row.editionReadyHolds();
                branches.add(new BranchAvailability(row.branchId(), row.branchCode(), row.branchName(), row.copies(),
                        row.compatibleWaitingHolds(), row.editionReadyHolds()));
            }
            return new EditionAvailability(entry.getKey(), counts, compatibleWaiting, ready, List.copyOf(branches));
        }).toList();
        List<BranchSummary> branches = branchRows.values().stream().map(row -> {
            CopyCounts counts = ZERO;
            for (AvailabilityRow editionRow : rows) {
                if (editionRow.branchId().equals(row.branchId())) counts = counts.plus(editionRow.copies());
            }
            return new BranchSummary(row.branchId(), row.branchCode(), row.branchName(), counts,
                    row.branchWaitingHolds(), row.branchReadyHolds());
        }).toList();
        return new Availability(bookId, checkedAt, bookCopies, bookWaitingHolds, bookReadyHolds, branches, editions);
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public List<CatalogAvailability> forBooks(List<UUID> bookIds) {
        if (bookIds == null || bookIds.isEmpty() || bookIds.size() > 20 || Set.copyOf(bookIds).size() != bookIds.size())
            throw new AuthFailure(422, "Cần từ 1 đến 20 mã tác phẩm khác nhau.");
        var named = new NamedParameterJdbcTemplate(jdbc);
        Long existing = named.queryForObject("SELECT count(*) FROM books WHERE id IN (:bookIds)", Map.of("bookIds", bookIds), Long.class);
        if (existing == null || existing != bookIds.size()) throw new AuthFailure(404, "Không tìm thấy đủ tác phẩm.");

        Map<UUID, CopyCounts> totals = new LinkedHashMap<>();
        Map<UUID, List<CatalogBranchAvailability>> branches = new LinkedHashMap<>();
        named.query("""
                SELECT e.book_id,b.id AS branch_id,b.code AS branch_code,b.name AS branch_name,
                       COUNT(c.id) FILTER (WHERE c.status<>'WITHDRAWN') AS total_copies,
                       COUNT(c.id) FILTER (WHERE c.status='AVAILABLE'
                           AND NOT EXISTS (SELECT 1 FROM loans l WHERE l.copy_id=c.id AND l.returned_at IS NULL)
                           AND NOT EXISTS (SELECT 1 FROM holds h WHERE h.copy_id=c.id AND h.status='READY')) AS available_copies,
                       COUNT(c.id) FILTER (WHERE c.status='ON_LOAN'
                           OR EXISTS (SELECT 1 FROM loans l WHERE l.copy_id=c.id AND l.returned_at IS NULL)) AS borrowed_copies,
                       COUNT(c.id) FILTER (WHERE c.status='ON_HOLD'
                           OR EXISTS (SELECT 1 FROM holds h WHERE h.copy_id=c.id AND h.status='READY')) AS reserved_copies,
                       COUNT(c.id) FILTER (WHERE c.status IN ('IN_PROCESS','DAMAGED','LOST')) AS unavailable_copies,
                       COUNT(c.id) FILTER (WHERE c.status='WITHDRAWN') AS withdrawn_copies
                FROM editions e
                JOIN book_copies c ON c.edition_id=e.id
                JOIN shelves s ON s.id=c.shelf_id
                JOIN branches b ON b.id=s.branch_id AND b.status='ACTIVE'
                WHERE e.book_id IN (:bookIds)
                GROUP BY e.book_id,b.id,b.code,b.name
                ORDER BY e.book_id,b.code,b.id
                """, Map.of("bookIds", bookIds), rs -> {
            UUID bookId = rs.getObject("book_id", UUID.class);
            CopyCounts counts = new CopyCounts(rs.getLong("total_copies"), rs.getLong("available_copies"),
                    rs.getLong("borrowed_copies"), rs.getLong("reserved_copies"),
                    rs.getLong("unavailable_copies"), rs.getLong("withdrawn_copies"));
            totals.merge(bookId, counts, CopyCounts::plus);
            branches.computeIfAbsent(bookId, ignored -> new ArrayList<>()).add(new CatalogBranchAvailability(
                    rs.getObject("branch_id", UUID.class), rs.getString("branch_code"),
                    rs.getString("branch_name"), counts));
        });
        return bookIds.stream().map(bookId -> new CatalogAvailability(bookId, totals.getOrDefault(bookId, ZERO),
                List.copyOf(branches.getOrDefault(bookId, List.of())))).toList();
    }
}
