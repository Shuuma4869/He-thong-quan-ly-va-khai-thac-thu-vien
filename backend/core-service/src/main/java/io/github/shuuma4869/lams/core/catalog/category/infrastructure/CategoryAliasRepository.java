package io.github.shuuma4869.lams.core.catalog.category.infrastructure;

import io.github.shuuma4869.lams.core.catalog.category.domain.Category;
import io.github.shuuma4869.lams.core.catalog.category.domain.CategoryAlias;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class CategoryAliasRepository {
    private final JdbcTemplate jdbc;

    public CategoryAliasRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public CategoryAlias create(CategoryAlias alias) {
        jdbc.update("INSERT INTO category_aliases(id,category_id,alias_name,normalized_alias) VALUES (?,?,?,?)",
                alias.id(), alias.categoryId(), alias.name(), alias.normalizedAlias());
        return alias;
    }

    public Optional<CategoryAlias> findById(UUID id) {
        return jdbc.query("SELECT id,category_id,alias_name,normalized_alias FROM category_aliases WHERE id=?",
                (rs, row) -> map(rs), id).stream().findFirst();
    }

    public boolean update(CategoryAlias alias) {
        return jdbc.update("UPDATE category_aliases SET category_id=?,alias_name=?,normalized_alias=? WHERE id=?",
                alias.categoryId(), alias.name(), alias.normalizedAlias(), alias.id()) == 1;
    }

    public boolean aliasKeyExists(String normalizedAlias, UUID exceptId) {
        if (exceptId == null) {
            return Boolean.TRUE.equals(jdbc.queryForObject(
                    "SELECT EXISTS(SELECT 1 FROM category_aliases WHERE normalized_alias=?)", Boolean.class,
                    normalizedAlias));
        }
        return Boolean.TRUE.equals(jdbc.queryForObject(
                "SELECT EXISTS(SELECT 1 FROM category_aliases WHERE normalized_alias=? AND id<>?)", Boolean.class,
                normalizedAlias, exceptId));
    }

    public boolean canonicalKeyExists(String normalizedName) {
        return Boolean.TRUE.equals(jdbc.queryForObject(
                "SELECT EXISTS(SELECT 1 FROM categories WHERE normalized_name=?)", Boolean.class, normalizedName));
    }

    public List<Category> findTermMatches(String normalizedTerm) {
        return jdbc.query("""
                SELECT id,name FROM categories WHERE normalized_name=?
                UNION ALL
                SELECT c.id,c.name FROM category_aliases a JOIN categories c ON c.id=a.category_id
                WHERE a.normalized_alias=?
                LIMIT 2
                """, (rs, row) -> new Category(rs.getObject("id", UUID.class), rs.getString("name")),
                normalizedTerm, normalizedTerm);
    }

    private static CategoryAlias map(java.sql.ResultSet rs) throws java.sql.SQLException {
        return new CategoryAlias(rs.getObject("id", UUID.class), rs.getObject("category_id", UUID.class),
                rs.getString("alias_name"), rs.getString("normalized_alias"));
    }
}
