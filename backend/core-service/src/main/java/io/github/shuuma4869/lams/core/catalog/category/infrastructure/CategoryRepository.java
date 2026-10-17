package io.github.shuuma4869.lams.core.catalog.category.infrastructure;

import io.github.shuuma4869.lams.core.catalog.category.domain.Category;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class CategoryRepository {
    public record CategoryPage(List<Category> items, long totalElements) {}
    private final JdbcTemplate jdbc;

    public CategoryRepository(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public Category create(Category category, String normalizedName) {
        jdbc.update("INSERT INTO categories (id,name,normalized_name) VALUES (?,?,?)",
                category.id(), category.name(), normalizedName);
        return category;
    }

    public Optional<Category> findById(UUID id) {
        return jdbc.query("SELECT id,name FROM categories WHERE id=?",
                (rs, row) -> new Category(rs.getObject("id", UUID.class), rs.getString("name")), id)
                .stream().findFirst();
    }

    public CategoryPage list(int page, int size) {
        long total = jdbc.queryForObject("SELECT count(*) FROM categories", Long.class);
        var items = jdbc.query("SELECT id,name FROM categories ORDER BY normalized_name,id LIMIT ? OFFSET ?",
                (rs, row) -> new Category(rs.getObject("id", UUID.class), rs.getString("name")), size,
                (long) page * size);
        return new CategoryPage(items, total);
    }

    public boolean update(Category category, String normalizedName) {
        return jdbc.update("UPDATE categories SET name=?, normalized_name=? WHERE id=?",
                category.name(), normalizedName, category.id()) == 1;
    }

    public boolean delete(UUID id) { return jdbc.update("DELETE FROM categories WHERE id=?", id) == 1; }
}
