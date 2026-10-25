package io.github.shuuma4869.lams.core.inventory.audit.infrastructure;

import io.github.shuuma4869.lams.core.inventory.audit.domain.InventorySession;
import io.github.shuuma4869.lams.core.inventory.audit.domain.InventoryEvidence.Copy;
import io.github.shuuma4869.lams.core.identity.application.AuthFailure;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class InventorySessionRepository {
    private final JdbcTemplate jdbc;
    public InventorySessionRepository(JdbcTemplate jdbc) { this.jdbc=jdbc; }
    public InventorySession find(UUID id, boolean lock) {
        return jdbc.query("SELECT * FROM inventory_sessions WHERE id=?"+(lock ? " FOR UPDATE" : ""),
            (r,n)->map(r), id).stream().findFirst().orElseThrow(()->new AuthFailure(404,"Không tìm thấy phiên kiểm kê."));
    }
    public List<Copy> snapshot(UUID id) {
        return jdbc.query("SELECT copy_id AS id,barcode,branch_id,shelf_id,status,copy_version AS version FROM inventory_snapshots WHERE session_id=? ORDER BY copy_id",
            (r,n)->copy(r), id);
    }
    public List<Copy> scope(UUID branch, UUID shelf) {
        return jdbc.query("""
            SELECT c.id,c.barcode,s.branch_id,c.shelf_id,c.status,c.version FROM book_copies c
            JOIN shelves s ON s.id=c.shelf_id WHERE s.branch_id=? AND (?::uuid IS NULL OR c.shelf_id=?)
            ORDER BY c.id LIMIT 5001
            """, (r,n)->copy(r), branch, shelf, shelf);
    }
    public static Copy copy(ResultSet r) throws SQLException {
        return new Copy(r.getObject("id",UUID.class),r.getString("barcode"),r.getObject("branch_id",UUID.class),
            r.getObject("shelf_id",UUID.class),r.getString("status"),r.getLong("version"));
    }
    public static InventorySession map(ResultSet r) throws SQLException {
        return new InventorySession(r.getObject("id",UUID.class),r.getObject("branch_id",UUID.class),r.getObject("shelf_id",UUID.class),
            r.getObject("opened_by",UUID.class),r.getTimestamp("opened_at").toInstant(),r.getString("status"),r.getLong("version"),
            r.getInt("snapshot_count"),r.getInt("scan_count"),r.getTimestamp("closed_at")==null?null:r.getTimestamp("closed_at").toInstant(),
            r.getObject("closed_by",UUID.class),r.getString("close_reason"));
    }
}
