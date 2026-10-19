package io.github.shuuma4869.lams.core.inventory.shelf.infrastructure;

import io.github.shuuma4869.lams.core.inventory.shelf.domain.Shelf;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class ShelfRepository {
    public record ShelfPage(List<Shelf> items, long totalElements) {}
    private final JdbcTemplate jdbc;
    public ShelfRepository(JdbcTemplate jdbc) { this.jdbc=jdbc; }
    public Shelf create(Shelf s) {
        jdbc.update("INSERT INTO shelves(id,branch_id,code,label,sort_order) VALUES (?,?,?,?,?)",
                s.id(),s.branchId(),s.code(),s.label(),s.sortOrder()); return s;
    }
    public Optional<Shelf> find(UUID id) {
        return find(id, false);
    }
    public Optional<Shelf> findForUpdate(UUID id) {
        return find(id, true);
    }
    private Optional<Shelf> find(UUID id, boolean lock) {
        return jdbc.query("SELECT s.id,s.branch_id,b.code AS branch_code,s.code,s.label,s.sort_order "
                        + "FROM shelves s JOIN branches b ON b.id=s.branch_id WHERE s.id=?"
                        + (lock ? " FOR UPDATE OF s" : ""),
                (r,n)->map(r),id).stream().findFirst();
    }
    public ShelfPage list(UUID branchId,int page,int size) {
        String where=branchId==null?"":" WHERE s.branch_id=?";
        Long total=branchId==null?jdbc.queryForObject("SELECT count(*) FROM shelves",Long.class)
                :jdbc.queryForObject("SELECT count(*) FROM shelves WHERE branch_id=?",Long.class,branchId);
        String sql="SELECT s.id,s.branch_id,b.code AS branch_code,s.code,s.label,s.sort_order FROM shelves s "
                +"JOIN branches b ON b.id=s.branch_id"+where+" ORDER BY s.branch_id,s.sort_order,s.code,s.id LIMIT ? OFFSET ?";
        Object[] args=branchId==null?new Object[]{size,(long)page*size}:new Object[]{branchId,size,(long)page*size};
        return new ShelfPage(jdbc.query(sql,(r,n)->map(r),args),total==null?0:total);
    }
    public boolean update(Shelf s) {
        return jdbc.update("UPDATE shelves SET branch_id=?,code=?,label=?,sort_order=? WHERE id=?",
                s.branchId(),s.code(),s.label(),s.sortOrder(),s.id())==1;
    }
    private static Shelf map(java.sql.ResultSet r)throws java.sql.SQLException {
        return new Shelf(r.getObject("id",UUID.class),r.getObject("branch_id",UUID.class),r.getString("branch_code"),
                r.getString("code"),r.getString("label"),r.getInt("sort_order"));
    }
}
