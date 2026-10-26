package io.github.shuuma4869.lams.core.inventory.copy.infrastructure;

import io.github.shuuma4869.lams.core.inventory.copy.domain.InventoryScopeCopy;
import io.github.shuuma4869.lams.core.inventory.copy.domain.InventoryScopeFilter;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class InventoryScopeRepository {
    public record Page(List<InventoryScopeCopy> items, long totalElements) {}

    private static final String SELECT = "SELECT c.id,c.edition_id,b.title,e.isbn13,c.shelf_id,s.branch_id,"
            + "s.code AS shelf_code,c.barcode,c.status,c.version FROM book_copies c "
            + "JOIN editions e ON e.id=c.edition_id JOIN books b ON b.id=e.book_id "
            + "JOIN shelves s ON s.id=c.shelf_id ";

    private final JdbcTemplate jdbc;

    public InventoryScopeRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public boolean branchExists(UUID id) {
        return Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM branches WHERE id=?)",
                Boolean.class, id));
    }

    public boolean editionExists(UUID id) {
        return Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM editions WHERE id=?)",
                Boolean.class, id));
    }

    public boolean shelfExists(UUID id) {
        return Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM shelves WHERE id=?)",
                Boolean.class, id));
    }

    public Page page(InventoryScopeFilter filter, int page, int size) {
        long total = count(filter);
        return new Page(items(filter, page, size), total);
    }

    public long count(InventoryScopeFilter filter) {
        var args = new ArrayList<Object>();
        String where = where(filter, args);
        Long total = jdbc.queryForObject("SELECT count(*) FROM book_copies c JOIN shelves s ON s.id=c.shelf_id"
                + where, Long.class, args.toArray());
        return total == null ? 0 : total;
    }

    public List<InventoryScopeCopy> items(InventoryScopeFilter filter, int page, int size) {
        var args = new ArrayList<Object>();
        String where = where(filter, args);
        var pageArgs = new ArrayList<>(args);
        pageArgs.add(size);
        pageArgs.add((long) page * size);
        return jdbc.query(SELECT + where + " ORDER BY c.barcode,c.id LIMIT ? OFFSET ?",
                (rs, row) -> map(rs), pageArgs.toArray());
    }

    /** Keyset batch; the caller owns one REPEATABLE READ transaction across all batches. */
    public List<InventoryScopeCopy> nextBatch(InventoryScopeFilter filter, String afterBarcode,
                                               UUID afterId, int size) {
        var args = new ArrayList<Object>();
        String where = where(filter, args);
        if (afterBarcode != null && afterId != null) {
            where += where.isEmpty() ? " WHERE " : " AND ";
            where += "(c.barcode > ? OR (c.barcode = ? AND c.id > ?))";
            args.add(afterBarcode);
            args.add(afterBarcode);
            args.add(afterId);
        }
        args.add(size);
        return jdbc.query(SELECT + where + " ORDER BY c.barcode,c.id LIMIT ?",
                (rs, row) -> map(rs), args.toArray());
    }

    private static String where(InventoryScopeFilter filter, List<Object> args) {
        var clauses = new ArrayList<String>();
        if (filter.branchId() != null) { clauses.add("s.branch_id=?"); args.add(filter.branchId()); }
        if (filter.editionId() != null) { clauses.add("c.edition_id=?"); args.add(filter.editionId()); }
        if (filter.shelfId() != null) { clauses.add("c.shelf_id=?"); args.add(filter.shelfId()); }
        if (filter.barcode() != null) { clauses.add("c.barcode=?"); args.add(filter.barcode()); }
        if (filter.status() != null) { clauses.add("c.status=?"); args.add(filter.status()); }
        return clauses.isEmpty() ? "" : " WHERE " + String.join(" AND ", clauses);
    }

    private static InventoryScopeCopy map(java.sql.ResultSet rs) throws java.sql.SQLException {
        UUID id = rs.getObject("id", UUID.class);
        return new InventoryScopeCopy(id, id, rs.getObject("edition_id", UUID.class), rs.getString("title"),
                rs.getString("isbn13"), rs.getObject("shelf_id", UUID.class),
                rs.getObject("branch_id", UUID.class), rs.getString("shelf_code"), rs.getString("barcode"),
                rs.getString("status"), rs.getLong("version"));
    }
}
