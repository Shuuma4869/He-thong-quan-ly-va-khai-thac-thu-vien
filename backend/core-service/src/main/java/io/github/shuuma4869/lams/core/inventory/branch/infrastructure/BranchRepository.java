package io.github.shuuma4869.lams.core.inventory.branch.infrastructure;

import io.github.shuuma4869.lams.core.inventory.branch.domain.Branch;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class BranchRepository {
    public record BranchPage(List<Branch> items, long totalElements) {}
    private final JdbcTemplate jdbc;
    public BranchRepository(JdbcTemplate jdbc) { this.jdbc = jdbc; }
    public Branch create(Branch b) {
        jdbc.update("INSERT INTO branches(id,code,name,status) VALUES (?,?,?,?)", b.id(),b.code(),b.name(),b.status());
        return b;
    }
    public Optional<Branch> find(UUID id) {
        return jdbc.query("SELECT id,code,name,status FROM branches WHERE id=?",
                (r,n)->new Branch(r.getObject("id",UUID.class),r.getString("code"),r.getString("name"),r.getString("status")),id)
                .stream().findFirst();
    }
    public BranchPage list(int page,int size) {
        long total=jdbc.queryForObject("SELECT count(*) FROM branches",Long.class);
        var items=jdbc.query("SELECT id,code,name,status FROM branches ORDER BY code,id LIMIT ? OFFSET ?",
                (r,n)->new Branch(r.getObject("id",UUID.class),r.getString("code"),r.getString("name"),r.getString("status")),
                size,(long)page*size);
        return new BranchPage(items,total);
    }
    public boolean update(Branch b) {
        return jdbc.update("UPDATE branches SET code=?,name=?,status=? WHERE id=?",b.code(),b.name(),b.status(),b.id())==1;
    }
}
